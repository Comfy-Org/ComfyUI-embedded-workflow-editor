interface FileSystemFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FileSystemFileHandle | FileSystemDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: any): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
  close(): Promise<void>;
}

interface Window {
  showOpenFilePicker(options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{
      description: string;
      accept: Record<string, string[]>;
    }>;
  }): Promise<FileSystemFileHandle[]>;

  showDirectoryPicker(options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
}
