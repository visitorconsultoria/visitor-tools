declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<globalThis.FileSystemDirectoryHandle>
  }
}

export {}
