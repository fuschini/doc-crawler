import fs, { stat } from 'fs';

import { RunReport } from './lib/types';

const scan_paths = [
    '/Users/fuschini/OneDrive - KIS Solutions/PS/Notes',
    '/Users/fuschini/OneDrive - KIS Solutions/Coaching',
]

export const handler = () => { 
    console.log('Hello World from handler');

    const runStartTimestamp = new Date();
    const lastRunTimestamp = fs.readFileSync('lastRunTimestamp.txt', 'utf8');
    
    let obj: RunReport[] = scan_paths.map(path => {

        const files = fs.readdirSync(path).map(file => {
            const stats = fs.statSync(`${path}/${file}`);

            return {
                name: file,
                last_modified: stats.mtime,
                todos: []
            }
        }).filter(file => file.name.endsWith('.docx') && file.last_modified > new Date(lastRunTimestamp));

        return {
            file_path: path,
            files: files
        }
    })

    console.log(JSON.stringify(obj, null, 2));
    console.log(`Last run: ${lastRunTimestamp}`);
}