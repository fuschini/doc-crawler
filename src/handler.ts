require('dotenv').config()
import fs from 'fs';
import { execSync } from 'child_process';

import { RunReport, Todo } from './lib/types';
const { Client } = require("@notionhq/client");

const scan_paths = [
    '/Users/fuschini/OneDrive - KIS Solutions/PS/Notes',
    '/Users/fuschini/OneDrive - KIS Solutions/Coaching',
]

export const handler = async () => { 
    const runStartTimestamp = new Date();
    const lastRunTimestamp = fs.readFileSync('lastRunTimestamp.txt', 'utf8');
    
    // Get all files in the scan_paths that have been modified since last run and end with .docx
    let obj: RunReport[] = scan_paths.map(path => {

        const files = fs.readdirSync(path).map(file => {
            const stats = fs.statSync(`${path}/${file}`);

            return {
                name: file,
                last_modified: stats.mtime,
                todos: []
            }
        // TODO revert this
        // }).filter(file => file.name.endsWith('.docx') && file.last_modified > new Date(lastRunTimestamp));
        }).filter(file => file.name.endsWith('ummy notes.docx'));

        return {
            file_path: path,
            files: files
        }
    })

    console.log(JSON.stringify(obj, null, 2));
    console.log(`Last run: ${lastRunTimestamp}`);

    for (const path of obj) {
        for (const file of path.files) {
            
            // unzip file into ./tmp
            execSync('rm -rf ./.tmp');
            execSync(`unzip "${path.file_path}/${file.name}" -d ./.tmp`);

            // read ./tmp/word/comments.xml
            let commentsContent = fs.readFileSync('./.tmp/word/comments.xml', 'utf8');

            // extract untracked TODOs that match pattern "TODO <task_name> by <yyyy-MM-dd> (tracked)?" from comments.xml
            let todos = extractUntrackedTodos(commentsContent);
            file.todos = todos;
            console.log(todos);

            if (todos?.filter(todo => todo.error_msg !== 'Could not parse TODO').length > 0) {
                // create todos on notion
                await createTodosOnNotion(todos?.filter(todo => todo.error_msg !== 'Could not parse TODO'), file.name, path.file_path);
    
                console.log("todos post notion processing: ", todos);
    
                // update comments.xml with tracked TODOs
                for (const todo of todos) {
                    if (todo.track_status) {
                        commentsContent = commentsContent.replace(todo.original_text, todo.original_text + ' (tracked)');
                    }
                }
                
            } else {
                console.log("No TODOs to process");
            }


            fs.writeFileSync('./output.xml', commentsContent);
        }
    }

}

function extractUntrackedTodos(commentsContent: string): Todo[] {
    const myCommentsRegex = /w:author="Henrique Fuschini.+?TODO[^<]*/g
    const todoTextRegex = /TODO[^<]*/g
    const todoRegex2 = /TODO ([\w ]*) by ([0-9]{4}-[0-9]{2}-[0-9]{2})( \(tracked\))?/

    let todosTextList = commentsContent.match(myCommentsRegex)

    const parsedTodos = todosTextList?.map(commentText => { 
        const todoText = commentText.match(todoTextRegex);

        if (!todoText || todoText.length === 0) {
            console.log(`ERROR: Could not parse TODO: ${commentText}`);
            console.log(`todotext: ${todoText}`);
            console.log(`todotext calculated: ${todoTextRegex.exec(commentText)}`);
            
            return {
                original_text: commentText,
                desc: '',
                due_date: '',
                track_status: false,
                error_msg: 'Could not parse TODO'
            }
        }

        const matches = todoRegex2.exec(todoText[0]);
        
        if (matches) {
            return {
                original_text: todoText[0],
                desc: matches[1],
                due_date: matches[2],
                track_status: matches[3] === ' (tracked)',
                error_msg: ''
            }
        } else {
            console.log(`ERROR: Could not parse TODO: ${commentText}`);
            console.log(`todotext: ${todoText}`);
            console.log(`todotext calculated: ${todoTextRegex.exec(commentText)}`);
            console.log(`matches: ${matches}`);
            
            return {
                original_text: todoText[0],
                desc: '',
                due_date: '',
                track_status: false,
                error_msg: 'Could not parse TODO'
            }
        }
    })
    console.log(parsedTodos);
    
    return parsedTodos?.filter(todo => !todo.track_status) ?? [];
}

async function createTodosOnNotion(todos: Todo[], file_name: string, file_path: string) { 
    
    const notion = new Client({ auth: process.env.NOTION_SECRET })

    const databaseId = process.env.NOTION_DB_ID;

    for (const todo of todos) { 
        try {
            const response = await notion.pages.create({
                parent: { database_id: databaseId },
                properties: {
                    Name: {
                        title: [
                            {
                                "text": {
                                    "content": todo.desc
                                }
                            }
                        ]
                    },
                    "Date prioritized": {
                        date: {
                            start: todo.due_date,
                        }
                    },
                    "Src file name": {
                        rich_text: [
                            {
                                "text": {
                                    "content": file_name
                                }
                            }
                        ]
                    },
                    "Src file path": {
                        rich_text: [
                            {
                                "text": {
                                    "content": file_path
                                }
                            }
                        ]
                    }
                },
            })

            console.log("Notion item added: ", response)

            todo.track_status = true;
        } catch (error: unknown) {
            console.log(error);
            todo.error_msg = error instanceof Error ? error.message : 'Unknown error';
        }
    }

    return todos;
}