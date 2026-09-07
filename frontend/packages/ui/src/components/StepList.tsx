import * as React from 'react';

export type StepState = 'pending' | 'active' | 'done';

export interface Step {
  title: React.ReactNode;
  content: React.ReactNode;
  state?: StepState;
}

export interface StepListProps {
  steps: Step[];
  className?: string;
}

/** Numbered steps rendered on one screen (DESIGN_SYSTEM.md §3 "Flujo de estacionamiento": zone → vehicle → time → summary). */
export function StepList({ steps, className }: StepListProps): React.JSX.Element {
  return (
    <ol className={['lx-step-list', className].filter(Boolean).join(' ')} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((step, index) => (
        <li key={index} className="lx-step" data-state={step.state ?? 'pending'}>
          <span className="lx-step__index" aria-hidden="true">
            {index + 1}
          </span>
          <div className="lx-step__body">
            <p className="lx-step__title">{step.title}</p>
            {step.content}
          </div>
        </li>
      ))}
    </ol>
  );
}
