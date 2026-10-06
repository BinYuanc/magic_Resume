// 浏览器 File System Access 扩展，TypeScript DOM 尚未包含权限方法。
type FileSystemPermissionMode = "read" | "readwrite";
interface FileSystemHandle {
  queryPermission(options?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
  requestPermission(options?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
}
