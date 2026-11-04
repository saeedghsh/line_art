// Reference copy of SquiggleCam's line generation and path serialisation,
// used only by the test suite to check the TypeScript port for fidelity.
//
// Source: https://github.com/msurguy/SquiggleCam
// Commit: b33aab5c6e5b5176853245c67f18b0e862f252f0
// Copyright (c) 2019 Maksim Surguy. MIT License, see ./LICENSE.
//
// The function bodies below are copied verbatim (extracted by line range);
// only the `export` wrappers around them were added.

// src/App.vue, lines 351-423: the function passed to `this.$worker.run(...)`
// in `processImage()`. Takes `{ config: settings, image: ImageData }`.
export const processImage = (data) => {
          // Gather all necessary data from the main thread
          let config = data.config;
// context.getImageData(0, 0, config.WIDTH, config.HEIGHT);
          const imagePixels = data.image;
          const width = parseInt(config.width);
          const height = parseInt(config.height);
          const contrast = parseInt(config.contrast);
          const brightness = parseInt(config.brightness);
          const lineCount = parseInt(config.lineCount);
          const minBrightness = parseInt(config.minBrightness);
          const maxBrightness = parseInt(config.maxBrightness);
          const spacing = parseFloat(config.spacing);
          const black = config.black;

// Create some defaults for squiggle-point array
          let squiggleData = [];
          let r = 5;
          let a = 0;
          let b;
          let z;
          let currentLine = []; // create empty array for storing x,y coordinate pairs
          let currentVerticalPixelIndex = 0;
          let currentHorizontalPixelIndex = 0;
          let contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast)); // This was established through experiments
          let horizontalLineSpacing = Math.floor(height / lineCount); // Number of pixels to advance in vertical direction

// Iterate line by line (top line to bottom line) in increments of horizontalLineSpacing
          //let tmpCounter = 0;
          for (let y = 0; y < height; y+= horizontalLineSpacing) {
            a = 0;
            currentLine = [];
            currentLine.push([0, y]); // Start the line

            currentVerticalPixelIndex = y*width;  // Because Image Pixel array is of length width * height,
                                                  // starting pixel for each line will be this

            // Loop through pixels from left to right within the current line, advancing by increments of config.SPACING
            //console.log(config.spacing, width);
            for (let x = spacing; x < width; x += spacing ) {

              currentHorizontalPixelIndex = Math.floor(x + currentVerticalPixelIndex); // Get array position of current pixel

              // When there is contrast adjustment, the calculations of brightness values are a bit different
              if (contrast !== 0) {
                // Determine how bright a pixel is, from 0 to 255 by summing three channels (R,G,B) multiplied by some coefficients
                b = (0.2125 * ((contrastFactor * (imagePixels.data[4 * currentHorizontalPixelIndex] - 128) + 128 )
                  + brightness)) + (0.7154 * ((contrastFactor * (imagePixels.data[4 * (currentHorizontalPixelIndex + 1)] - 128) + 128)
                  + brightness)) + (0.0721 * ((contrastFactor*(imagePixels.data[4*(currentHorizontalPixelIndex+2)]-128)+128) + brightness));
              } else {
                b = (0.2125 * (imagePixels.data[4*currentHorizontalPixelIndex] + brightness)) + (0.7154 * (imagePixels.data[4*(currentHorizontalPixelIndex + 1)]+ brightness)) + (0.0721 * (imagePixels.data[4*(currentHorizontalPixelIndex + 2)] + brightness));
              }

              if (black) {
                b = Math.min(255-minBrightness,255-b);    // Set minimum line curvature to value set by the user
                z = Math.max(maxBrightness-b,0);  // Set maximum line curvature to value set by the user
              } else {
                b = Math.max(minBrightness,b);    // Set minimum line curvature to value set by the user
                z = Math.max(maxBrightness-b,0);  // Set maximum line curvature to value set by the user
              }

              // The magic of the script, determines how high / low the squiggle goes
              r = config.amplitude * z / lineCount;

              a += z / config.frequency;
              currentLine.push([x,y + Math.sin(a)*r]);
            }
            //currentLine.push([config.width, y]);
            squiggleData.push(currentLine);
          }

          return squiggleData;
        };

// src/components/svgChartLine.vue, lines 10-20: computed `pathD()`.
// Call as `svgChartLine.pathD.call({ d: { values: points } })`.
export const svgChartLine = {
      pathD() {
        let path = "";
        this.d.values.forEach((point, index) => {
          if (index === 0) {
            path += `M ${point[0]},${point[1]}`;
          } else {
            path += `L${Math.round(point[0] * 100) / 100},${Math.round(point[1]*100)/100}`
          }
        });
        return path;
      }
};
