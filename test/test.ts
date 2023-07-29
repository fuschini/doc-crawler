import assert from 'assert';
import fs from 'fs';
import {
    getLastRunTimestamp,
    getFilesToBeScanned,
    extractDocContents,
    extractUntrackedTodos
} from '../src/handler';
import { todo } from 'node:test';

describe('Doc to Notion flow', function () {
    const scan_paths = [
        './test/test_files'
    ]

    it('should get the last run timestamp', function () {
        const lastRunTimestamp = getLastRunTimestamp();
        assert(typeof lastRunTimestamp === 'string', 'lastRunTimestamp is not a string');
        assert(lastRunTimestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/), 'lastRunTimestamp is not a valid timestamp')
    })

    it('should only get files from scan path modified after last run date', function () {
        const result = getFilesToBeScanned(scan_paths);

        const doc = fs.readFileSync('./test/test_files/dummy_doc.docx');
        fs.unlinkSync('./test/test_files/dummy_doc.docx');
        fs.writeFileSync('./test/test_files/dummy_doc.docx', doc);

        assert.equal(result[0].file_path, './test/test_files', 'test file_path is not correct');
        assert.equal(result[0].files.length, 1, 'test files length is not correct');
        assert.notEqual(result[0].files[0].name, 'old_doc.docx', 'test file name is not correct');
    });

    it('should extract doc contents to tmp folder and contain comment.xml', function () {
        extractDocContents('./test/test_files', 'dummy_doc.docx');
        assert(fs.existsSync('./.tmp'), 'tmp folder does not exist');
        assert(fs.existsSync('./.tmp/word/comments.xml'), 'comments.xml does not exist');
    })

    const commentsContent = fs.readFileSync('./.tmp/word/comments.xml', 'utf8');
    const todos = extractUntrackedTodos(commentsContent);
    console.log(todos);


    it('should only extract untracked TODOs from comments.xml', function () {
        assert.equal(todos.length, 2, todos.length > 2 ? `more than the 2 expected todos found: ${todos.length}` : `less than 2 todos found: ${todos.length}`);
        assert.equal(todos[1].original_text, 'TODO untracked todo by 2023-07-30', 'expected todo text in position 1 is not correct');
        const trackedTodos = todos.filter(todo => todo.original_text.match(/\(tracked\)/));
        assert.equal(trackedTodos.length, 0, `${trackedTodos.length} tracked todos found`);
    })

    it('should ignore comments that don\'t contain TODOs', function () {
        const randomComment = todos.filter(todo => !todo.original_text.match(/^TODO/));
        assert.equal(randomComment.length, 0, 'comment that does not start with TODO found');
    })

    it('should identify todos with an invalid date', function () {
        const invalidDateTodoIndex = todos.findIndex(todo => todo.original_text == 'TODO invalid todo by Jul 23');
        assert.notEqual(invalidDateTodoIndex, -1, 'invalid date todo not found');
        assert.equal(todos[invalidDateTodoIndex].error_msg, 'Could not parse TODO', 'todo.error_msg is not correct');
    })

    it('should parse an untracked todo text into todo object', function () {
        const validTodoIndex = todos.findIndex(todo => todo.original_text == 'TODO untracked todo by 2023-07-30');
        assert.notEqual(validTodoIndex, -1, 'valid todo not found');
        assert.equal(todos[1].desc, 'untracked todo', 'todo.desc is not correct');
        assert.equal(todos[1].due_date, '2023-07-30', 'todo.due_date is not correct');
        assert.equal(todos[1].track_status, false, 'todo.track_status is not correct');
        assert.equal(todos[1].error_msg, '', 'todo.error_msg is not correct');
    })

    it('should only extract todos created by the user', function () {
        const todosFromOtherUsers = todos.filter(todo => todo.original_text == 'TODO from another user by 2023-07-01');
        assert.equal(todosFromOtherUsers.length, 0, 'todo from another user found');
    })

});