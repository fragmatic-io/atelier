// @vitest-environment happy-dom
import './setup.js';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertBinding } from '../src/components/Alert.js';

describe('Alert', () => {
  it('renders children', () => {
    render(<Alert severity="info">heads up</Alert>);
    expect(screen.getByText('heads up')).toBeTruthy();
  });

  it('renders the title when provided', () => {
    render(
      <Alert severity="info" title="Notice">
        body
      </Alert>,
    );
    expect(screen.getByText('Notice')).toBeTruthy();
  });

  it('uses role=alert for error severity', () => {
    render(<Alert severity="error">x</Alert>);
    expect(screen.getByRole('alert').getAttribute('data-severity')).toBe('error');
  });

  it('uses role=alert for warning severity', () => {
    render(<Alert severity="warning">x</Alert>);
    expect(screen.getByRole('alert').getAttribute('data-severity')).toBe('warning');
  });

  it('uses role=status for info severity', () => {
    render(<Alert severity="info">x</Alert>);
    expect(screen.getByRole('status').getAttribute('data-severity')).toBe('info');
  });

  it('uses role=status for success severity', () => {
    render(<Alert severity="success">x</Alert>);
    expect(screen.getByRole('status').getAttribute('data-severity')).toBe('success');
  });

  it('binding id matches', () => {
    expect(AlertBinding.id).toBe('Alert');
  });
});
