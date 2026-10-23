// Runs the simulation off the main thread so sliders stay responsive.
import { analyze } from './simulation.js';

self.onmessage = (event) => {
  const { id, model, assumptions, active } = event.data;
  self.postMessage({ id, out: analyze(model, assumptions, active) });
};
