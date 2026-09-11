import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { BookOpenCheck, Plus, Check } from 'lucide-react';
import { DecisionLesson, LessonInput } from '../../types';
import { formatDate } from '../../utils/helpers';

interface LessonsPanelProps {
  lessons: DecisionLesson[];
  onCreateLesson?: (input: LessonInput) => Promise<void>;
  onUpdateLesson?: (lessonId: string, patch: Partial<LessonInput>) => Promise<void>;
}

const Tag: React.FC<{ label: string; confirmed: boolean }> = ({ label, confirmed }) => (
  <span
    className={`px-2 py-0.5 rounded text-[10px] border ${
      confirmed
        ? 'bg-green-500/10 border-green-500/20 text-green-400'
        : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
    }`}
  >
    {label}
  </span>
);

export const LessonsPanel: React.FC<LessonsPanelProps> = ({ lessons, onCreateLesson, onUpdateLesson }) => {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [metricName, setMetricName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!text.trim()) {
      setErr('Lesson text is required.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await onCreateLesson?.({
        text: text.trim(),
        source: 'human',
        status: 'confirmed',
        metricName: metricName.trim() || undefined,
      });
      setText('');
      setMetricName('');
      setAdding(false);
    } catch (e: any) {
      setErr(e.message || 'Failed to save lesson.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <BookOpenCheck size={14} /> Lessons Learned
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        {onCreateLesson && !adding && (
          <div className="flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
              <Plus size={14} /> Add lesson
            </Button>
          </div>
        )}

        {adding && (
          <div className="p-3 rounded bg-theme-bg-tertiary border border-theme-border space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-theme-text-secondary">Record a lesson</div>
            <textarea
              className="w-full bg-theme-bg-secondary border border-theme-border rounded px-2 py-1.5 text-sm text-theme-text-primary focus:outline-none"
              rows={2}
              placeholder="What should be remembered about this decision?"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div>
              <label className="block text-[11px] text-theme-text-secondary mb-1">Metric (optional)</label>
              <input
                className="w-full bg-theme-bg-secondary border border-theme-border rounded px-2 py-1.5 text-sm text-theme-text-primary focus:outline-none"
                value={metricName}
                onChange={(e) => setMetricName(e.target.value)}
                placeholder="e.g. cost, latency, accuracy"
              />
            </div>
            {err && <p className="text-xs text-red-400">{err}</p>}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleAdd} isLoading={submitting}>
                Save lesson
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {lessons.length === 0 && !adding && (
          <p className="text-xs text-theme-text-secondary py-3 text-center">
            No lessons recorded. Lessons capture what should be remembered for future decisions.
          </p>
        )}

        <div className="space-y-2">
          {lessons.map((lesson) => (
            <div key={lesson.id} className="p-3 rounded bg-theme-bg-tertiary border border-theme-border">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Tag
                    label={lesson.source === 'human' ? 'human' : 'LLM suggestion'}
                    confirmed={lesson.status === 'confirmed'}
                  />
                  <Tag label={`${lesson.status}`} confirmed={lesson.status === 'confirmed'} />
                </div>
                <span className="text-[11px] text-theme-text-secondary">{formatDate(new Date(lesson.createdAt))}</span>
              </div>

              {lesson.source === 'llm_suggestion' && lesson.status === 'unconfirmed' && onUpdateLesson && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onUpdateLesson(lesson.id, { status: 'confirmed' })}
                  >
                    <Check size={14} /> Confirm
                  </Button>
                </div>
              )}

              <p className="text-sm text-theme-text-primary mt-2 leading-relaxed">{lesson.text}</p>

              <div className="flex items-center gap-2 mt-2 text-[11px] text-theme-text-secondary flex-wrap">
                {lesson.metricName && <span>metric: <span className="text-theme-text-primary">{lesson.metricName}</span></span>}
                {lesson.outcomeId && <span>linked to outcome</span>}
                {lesson.evidenceIds.length > 0 && <span>{lesson.evidenceIds.length} evidence reference(s)</span>}
              </div>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
};