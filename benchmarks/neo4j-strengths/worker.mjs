import { parentPort,workerData } from 'node:worker_threads';
import { SqlReader } from './common.mjs';
const db=new SqlReader(workerData.file);
parentPort.on('message',({seq,workload,p,implementation})=>{try{parentPort.postMessage({seq,result:db.run(workload,p,implementation)});}catch(e){parentPort.postMessage({seq,error:String(e.stack)});}});
parentPort.postMessage({ready:true});
