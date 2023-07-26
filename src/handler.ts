import fs, { stat } from 'fs';

const scan_paths = [
    '/Users/fuschini/OneDrive - KIS Solutions/PS/Notes',
    '/Users/fuschini/OneDrive - KIS Solutions/Coaching',
]

interface RunReport {
    file_path: string,
    files: File[]
}

interface File {
    name: string,
    last_modified: Date,
    todos: Todo[]
}

interface Todo {
    original_text: string,
    desc: string,
    due_date: string,
    track_status: Boolean
    error_msg: string
}

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