export function isPretripVideo(file: { content_type?: string | null; file_name?: string | null }): boolean {
  if(file.content_type)return file.content_type.startsWith("video/");
  return /\.(mov|mp4|m4v|webm)$/i.test(file.file_name ?? "");
}
