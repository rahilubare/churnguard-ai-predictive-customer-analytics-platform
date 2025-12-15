import React, { useState, useRef } from 'react';
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
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFile = (selectedFile: File | null) => {
    setError(null);
    if (selectedFile) {
      const name = selectedFile.name.toLowerCase();
      if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
        setError('Invalid file type. Please upload a CSV or XLSX file.');
        onFileSelect(null);
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File is too large. Maximum size is 10MB.');
        onFileSelect(null);
        return;
      }
    }
    onFileSelect(selectedFile);
  };
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };
  const handleRemoveFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleFile(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };
  if (file) {
    return (
      <div className="w-full p-6 border-2 border-dashed rounded-lg bg-secondary/50 flex items-center justify-between transition-all">
        <div className="flex items-center gap-4 overflow-hidden">
          <FileIcon className="h-8 w-8 text-primary flex-shrink-0" />
          <div className="truncate">
            <p className="font-semibold text-foreground truncate">{file.name}</p>
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
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'w-full p-10 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-300 ease-in-out',
        'flex flex-col items-center justify-center text-center shimmer-bg',
        isDragActive ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-secondary/50'
      )}
    >
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleChange} />
      <div className="p-4 rounded-full bg-primary/10 mb-4">
        <UploadCloud className="h-10 w-10 text-primary" />
      </div>
      <h3 className="text-xl font-semibold text-foreground">
        {isDragActive ? 'Drop the file here...' : 'Drag & drop a CSV or XLSX file'}
      </h3>
      <p className="text-muted-foreground mt-1">or click to select a file</p>
      <p className="text-xs text-muted-foreground/80 mt-4">Max file size: 10MB</p>
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
  );
}