import { parentPort } from 'node:worker_threads';
import { openGraph,runNodeRel } from './common.mjs';
const graph=openGraph();
parentPort.on('message',({workload,p,algorithm})=>{
 try{const start=performance.now();const value=runNodeRel(graph,workload,p,algorithm);parentPort.postMessage({value,executionMs:performance.now()-start});}
 catch(error){parentPort.postMessage({error:error.stack});}
});
parentPort.postMessage({ready:true});
