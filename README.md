# Doc crawler

## Description

A simple crawler that will crawl MS Word docs in selected folders in your machine, extract TODOs from comments with a specific syntax, and send them to a Notion database.

## Architecture Overview

![Dataflow diagram](assets/dataflow.png)

1. User adds a comment in a Word doc with a specific syntax
    - The syntax is: `TODO <todo description> by <due date>`
    - The file can be in any path of the selected folders that will be scanned
2. User starts the script manualy from the machine
3. The script scans the selected folders for files modified since the time of the last run
    - Time of the last run is stored in a local file `lastRunTimestamp.txt` as a ISO string timestamp (e.g. `2023-06-15T00:00:00.000Z`)
    - The folders that will be scanned are hardcoded in the `scan_paths array` in `index.ts`
4. The script extracts the TODOs from the comments in the scanned files
    - Only comments that match the syntax `TODO <todo description> by <due date>` are extracted
    - Only comments created by the user running the script are extracted (hardcoded in the regex `myCommentsRegex` in `handler.ts`)
    - Only comments not tracked yet are extracted (identified with `(tracked)` in the comment text)
5. The extracted TODOs added to a Notion database
    - The Notion database ID is stored in the `NOTION_DB_ID` env var
    - The Notion API secret is stored in the `NOTION_SECRET` env var
6. The TODO is created in Notion with the following parameters:
    - Item name
    - Due date
    - File name
    - File path
7. The script updates the text of the tracked comments in the original doc appending `(tracked)` to the comment text
8. The script updates the `lastRunTimestamp.txt` file with the timestamp of the start of the run
9. The script saves an execution report with the processing result of every tracked todo
    - The report is appended to a local file `.logs/yyyy-MM-dd.txt` in which the date is the date of the run

## Setup & Run

Requisites:
- Node.js installed
- A Notion DB created with at least the following properties
    - Name
    - Date prioritized
    - File name
    - File path
- Notion integration created and integrated with your DB ([How to create a Notion integration](https://developers.notion.com/docs/create-a-notion-integration))

First run
1. Install dependencies `npm i`
2. Create `.env` file with `NOTION_DB_ID` and `NOTION_SECRET` env vars
3. Add the paths you want to be scanned to the `scan_paths` array in `index.ts`
4. Add the name of the user that will be creating the comments to the `myCommentsRegex` regex in `handler.ts`