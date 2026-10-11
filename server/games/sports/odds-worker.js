// Calcule les probabilités du match de foot en arrière-plan (plusieurs secondes de calcul).
import { parentPort, workerData } from 'node:worker_threads';
import { estimate } from './foot.js';

parentPort.postMessage(estimate(workerData.cfg, workerData.n, workerData.seed));
