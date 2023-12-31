require('dotenv').config()
import fs from 'fs';
import { execSync } from 'child_process';

import { RunReport, Todo } from './lib/types';
import { format } from 'date-fns';
import { log } from 'console';
const { Client } = require("@notionhq/client");

export function getLastRunTimestamp() {
    return fs.readFileSync('lastRunTimestamp.txt', 'utf8');
}

export function getFilesToBeScanned(scan_paths: string[]): RunReport[] {
    const lastRunTimestamp = getLastRunTimestamp();

    return scan_paths.map(path => {

        const files = fs.readdirSync(path).map(file => {
            const stats = fs.statSync(`${path}/${file}`);

            return {
                name: file,
                last_modified: stats.mtime,
                todos: []
            }
        }).filter(file => file.name.match(/^[^~].+\.docx$/) && file.last_modified > new Date(lastRunTimestamp));
        // }).filter(file => file.name.endsWith('ummy notes.docx'));

        return {
            file_path: path,
            files: files
        }
    })
}

export function extractDocContents(file_path: string, file_name: string) {
    // unzip file into ./tmp
    execSync('rm -rf ./.tmp');
    execSync(`unzip "${file_path}/${file_name}" -d ./.tmp`);
}

export const handler = async (scan_paths: string[]) => {
    const runStartTimestamp = new Date();

    // Get all files in the scan_paths that have been modified since last run and end with .docx
    let obj = getFilesToBeScanned(scan_paths);

    for (const path of obj) {
        for (const file of path.files) {

            extractDocContents(path.file_path, file.name);

            // read ./tmp/word/comments.xml
            let commentsContent = fs.readFileSync('./.tmp/word/comments.xml', 'utf8');

            // extract untracked TODOs that match pattern "TODO <task_name> by <yyyy-MM-dd> (tracked)?" from comments.xml
            let todos = extractUntrackedTodos(commentsContent);
            file.todos = todos;

            // Only for untracked todos that could be parsed
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

                // update ./tmp/word/comments.xml with tracked TODOs
                fs.writeFileSync('./.tmp/word/comments.xml', commentsContent);

                // zip ./tmp back into original file
                execSync(`cd ./.tmp && zip -r "${path.file_path}/${file.name}" * && cd ..`);
            } else {
                console.log("No TODOs to process");
            }

            fs.writeFileSync('./output.xml', commentsContent);
        }
    }

    fs.appendFileSync(`./.logs/${format(runStartTimestamp, 'yyyy-MM-dd')}.txt`, `${runStartTimestamp.toISOString()} \n ${JSON.stringify(obj, null, 2)}\n\n`);
    fs.writeFileSync('lastRunTimestamp.txt', runStartTimestamp.toISOString());
}

export function extractUntrackedTodos(commentsContent: string): Todo[] {
    const myCommentsRegex = /w:author="Henrique Fuschini.+?<\/w:comment>/g
    const todoTextRegex = /TODO[^<]*/g
    const todoRegex2 = /TODO ([\w ]*) by ([0-9]{4}-[0-9]{2}-[0-9]{2})( \(tracked\))?/

    let todosTextList = commentsContent.match(myCommentsRegex)
    console.log("todosTextList: ", todosTextList);


    const parsedTodos = todosTextList?.filter(todoText => todoText.match('<w:t>TODO')).map(commentText => {
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

export async function createTodosOnNotion(todos: Todo[], file_name: string, file_path: string) {

    const notion = new Client({ auth: process.env.NOTION_SECRET })
    const databaseId = process.env.NOTION_DB_ID;
    const responses = [];

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
            responses.push(response);

        } catch (error: unknown) {
            console.log(error);
            todo.error_msg = error instanceof Error ? error.message : 'Unknown error';
            responses.push(error);
        }
    }

    return responses;
}