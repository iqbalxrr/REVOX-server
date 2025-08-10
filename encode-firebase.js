
// encode-firebase.js
import fs from 'fs';

const json = fs.readFileSync('./serviceAccountKey.json', 'utf-8');
const base64 = Buffer.from(json).toString('base64');

console.log('Base64 Encoded String:\n');
console.log(base64);
