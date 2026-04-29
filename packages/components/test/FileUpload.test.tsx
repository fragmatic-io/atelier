// @vitest-environment happy-dom
import './setup.js';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FileUpload, FileUploadBinding } from '../src/components/FileUpload.js';

describe('FileUpload', () => {
  it('renders a labelled <input type="file">', () => {
    render(<FileUpload label="Attach" onFiles={() => undefined} />);
    const input = screen.getByLabelText<HTMLInputElement>('Attach');
    expect(input.type).toBe('file');
  });

  it('forwards accept and multiple to the underlying input', () => {
    render(<FileUpload label="Attach" accept="image/*" multiple onFiles={() => undefined} />);
    const input = screen.getByLabelText<HTMLInputElement>('Attach');
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(true);
  });

  it('fires onFiles and lists chosen filenames when files change', () => {
    const seen: File[][] = [];
    render(
      <FileUpload
        label="Attach"
        multiple
        onFiles={(files) => {
          seen.push(files);
        }}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Attach');
    const file1 = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const file2 = new File(['world'], 'world.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file1, file2] } });
    expect(seen.length).toBe(1);
    expect(seen[0]?.map((f) => f.name)).toEqual(['hello.txt', 'world.txt']);
    expect(screen.getByText('hello.txt')).toBeTruthy();
    expect(screen.getByText('world.txt')).toBeTruthy();
  });

  it('handles an empty FileList by emitting []', () => {
    let last: File[] | undefined;
    render(
      <FileUpload
        label="Attach"
        onFiles={(files) => {
          last = files;
        }}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>('Attach');
    fireEvent.change(input, { target: { files: [] } });
    expect(last).toEqual([]);
  });

  it('forwards ref to the underlying input', () => {
    const ref = createRef<HTMLInputElement>();
    render(<FileUpload ref={ref} label="Attach" onFiles={() => undefined} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('binding id matches', () => {
    expect(FileUploadBinding.id).toBe('FileUpload');
  });
});
