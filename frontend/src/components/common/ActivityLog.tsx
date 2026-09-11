import { Activity } from "lucide-react";

type ActivityLogProps = {
  title: string;
  reason: string;
  actor: string;
  actorLabel?: string;
  time: string;
};

export function ActivityLog({ title, reason, actor, actorLabel = "Closed by", time }: ActivityLogProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="p-2 bg-white rounded-lg border border-gray-200 shrink-0">
        <Activity className="w-4 h-4 text-gray-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 break-words">{title}</p>
        <div className="mt-1 text-sm text-gray-600 space-y-0.5">
          {reason && (
            <p className="break-words">
              <span className="text-gray-400">Reason:</span> {reason}
            </p>
          )}
          {actor && (
            <p className="text-gray-400">{actorLabel}: {actor}</p>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{time}</p>
      </div>
    </div>
  );
}
