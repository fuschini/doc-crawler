export interface RunReport {
    file_path: string,
    files: File[]
}

export interface File {
    name: string,
    last_modified: Date,
    todos: Todo[]
}

export interface Todo {
    original_text: string,
    desc: string,
    due_date: string,
    track_status: Boolean
    error_msg: string
}