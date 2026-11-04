import sys
from pathlib import Path

# Make the reference helpers importable from the tests; importing them also
# puts the linedraw wrapper and the vendored upstream modules on sys.path.
sys.path.insert(0, str(Path(__file__).parent))
