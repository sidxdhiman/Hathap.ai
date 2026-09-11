import React, { useState } from 'react';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Button } from '../ui/Button';
import { ThumbsUp } from 'lucide-react';
import { DecisionFeedback, FeedbackInput, FeedbackStatus } from '../../types';
import { formatDate } from '../../utils/helpers';

interface FeedbackPanelProps {
  feedback: DecisionFeedback | null;
  onSubmit?: (input: FeedbackInput) => Promise<void>;
}

const FEEDBACK_OPTIONS: FeedbackStatus[] = ['accepted', 'modified', 'rejected', 'unknown'];

const tone = (s: FeedbackStatus) => {
  switch (s) {
    case 'accepted': return 'bg-green-500/10 border-green-500/20 text-green-400';
    case 'rejected': return 'bg-red-500/10 border-red-500/20 text-red-400';
    case 'modified': return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
    default: return 'bg-theme-bg-tertiary border-theme-border text-theme-text-secondary';
  }
};

const toneActive = (s: FeedbackStatus) => {
  switch (s) {
    case 'accepted': return 'border-green-500 text-green-300';
    case 'rejected': return 'border-red-500 text-red-300';
    case 'modified': return 'border-amber-500 text-amber-300';
    default: return 'border-theme-text-secondary text-theme-text-primary';
  }
};

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ feedback, onSubmit }) => {
  const [editing, setEditing] = useState(!feedback);
  const [status, setStatus] = useState<FeedbackStatus>(feedback?.recommendationStatus || 'unknown');
  const [reason, setReason] = useState(feedback?.reason || '');
  const [comment, setComment] = useState(feedback?.comment || '');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit?.({
        recommendationStatus: status,
        reason: reason.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      setEditing(false);
    } catch (e: any) {
      setErr(e.message || 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2 text-sm font-semibold text-theme-text-primary">
          <ThumbsUp size={14} /> Human Feedback
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        {!feedback && !editing && !onSubmit && (
          <p className="text-xs text-theme-text-secondary py-2 text-center">No feedback recorded.</p>
        )}

        {feedback && !editing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[11px] border ${tone(feedback.recommendationStatus)}`}>
                {feedback.recommendationStatus}
              </span>
              {feedback.submittedAt && (
                <span className="text-[11px] text-theme-text-secondary">{formatDate(new Date(feedback.submittedAt))}</span>
              )}
            </div>
            {feedback.reason && (
              <p className="text-sm text-theme-text-primary">{feedback.reason}</p>
            )}
            {feedback.comment && (
              <p className="text-xs text-theme-text-secondary">{feedback.comment}</p>
            )}
            {onSubmit && (
              <Button size="sm" variant="secondary" onClick={() => { setEditing(true); setStatus(feedback.recommendationStatus); setReason(feedback.reason || ''); setComment(feedback.comment || ''); }}>
                Edit feedback
              </Button>
            )}
          </div>
        ) : (
          onSubmit && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_OPTIONS.map((s) => (
                  <button
                    key={s}
                    className={`px-2 py-0.5 rounded text-[11px] border ${
                      status === s ? toneActive(s) : 'border-theme-border text-theme-text-secondary hover:text-theme-text-primary'
                    }`}
                    onClick={() => setStatus(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <textarea
                className="w-full bg-theme-bg-secondary border border-theme-border rounded px-2 py-1.5 text-sm text-theme-text-primary focus:outline-none"
                rows={2}
                placeholder="Reason (why was the recommendation accepted/rejected/modified?)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <textarea
                className="w-full bg-theme-bg-secondary border border-theme-border rounded px-2 py-1.5 text-sm text-theme-text-primary focus:outline-none"
                rows={2}
                placeholder="Comment (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              {err && <p className="text-xs text-red-400">{err}</p>}
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSubmit} isLoading={submitting}>
                  {feedback ? 'Update feedback' : 'Submit feedback'}
                </Button>
                {feedback && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )
        )}
      </CardBody>
    </Card>
  );
};