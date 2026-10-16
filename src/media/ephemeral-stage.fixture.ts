import {createEphemeralStage,markEphemeralStageReady} from './ephemeral-stage';
const parent = process.argv[2], state = process.argv[3];
if (!parent || (state !== 'acquiring' && state !== 'ready')) throw new Error('fixture arguments');
const supervisor = {requestId:'crash-fixture',processGroupId:process.pid,processStartIdentity:'owned-child-fixture'};
const receipt = await createEphemeralStage(parent,supervisor);
if (state === 'ready') await markEphemeralStageReady(receipt);
process.stdout.write(JSON.stringify(receipt)+'\n');
setInterval(()=>{},1000);
