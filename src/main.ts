import { algorithms } from './algorithms/registry';
import { App } from './app/app';
import './styles.css';

const [first, ...rest] = algorithms;
if (!first) throw new Error('No algorithms are registered.');
new App([first, ...rest]);
