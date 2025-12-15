import React, { useState, useCallback } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { UploadCloud, File as FileIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { useAppStore } from '@/store/app-store';
interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
}
export function FileUpload({ onFileSelect }: FileUploadProps): JSX.Element {
  const file = useAppStore(s => s.rawFile);
  const isProcessing = useAppStore(s => s.isProcessing);
  const [error, setError] = useState<string | null>(null);
  const onDrop = useCallback((acceptedFiles: File[], fileRejections: FileRejection[]) => {
    setError(null);
    if (fileRejections.length > 0) {
      setError(fileRejections[0].errors[0].message);
      onFileSelect(null);
    } else if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });
  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
  };
  if (file) {
    return (
      <div className="w-full p-6 border-2 border-dashed rounded-lg bg-secondary/50 flex items-center justify-between transition-all">
        <div className="flex items-center gap-4">
          <FileIcon className="h-8 w-8 text-primary" />
          <div>
            <p className="font-semibold text-foreground">{file.name}</p>
            <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleRemoveFile} disabled={isProcessing}>
          <X className="h-5 w-5" />
        </Button>
      </div>
    );
  }
  return (
    <div
      {...getRootProps()}
      className={cn(
        'w-full p-10 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-300 ease-in-out',
        'flex flex-col items-center justify-center text-center',
        isDragActive
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50 hover:bg-secondary/50'
      )}
    >
      <input {...getInputProps()} />
      <div className="p-4 rounded-full bg-primary/10 mb-4">
        <UploadCloud className="h-10 w-10 text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-foreground">
        {isDragActive ? 'Drop the file here...' : 'Drag & drop a CSV file here'}
      </h3>
      <p className="text-muted-foreground mt-1">or click to select a file</p>
      <p className="text-xs text-muted-foreground/80 mt-4">Max file size: 10MB</p>
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
  );
}