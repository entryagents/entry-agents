"use client";

import { Check, MessageCircleQuestion } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

export function AskUserQuestionRenderer({
  part,
  state,
}: ToolRendererProps<"tool-ask_user_question">) {
  const input = part.input;
  const output = part.state === "output-available" ? part.output : undefined;
  const questions = input?.questions ?? [];

  const isWaitingForInput = part.state === "input-available";
  const isStreaming = part.state === "input-streaming";
  const hasOutput = part.state === "output-available";
  const isDeclined =
    hasOutput && output && "declined" in output && output.declined;
  const hasAnswers =
    hasOutput && output && "answers" in output && output.answers !== null;

  const summary = isStreaming
    ? "Generating questions"
    : isWaitingForInput
      ? "Waiting for your answer"
      : isDeclined
        ? "Declined"
        : hasAnswers
          ? "Answered"
          : state.denied
            ? "Cancelled"
            : "Questions";

  const questionCount = questions.length;
  const meta =
    questionCount > 0
      ? `${questionCount} ${questionCount === 1 ? "question" : "questions"}`
      : undefined;

  const expandedContent =
    hasAnswers && output && "answers" in output ? (
      <div className="sable-qa">
        {questions.map((q) => {
          if (!q?.question) return null;
          const questionKey = q.question;
          const rawAnswer = output.answers[questionKey];
          const picked = Array.isArray(rawAnswer)
            ? rawAnswer.filter(Boolean)
            : rawAnswer
              ? [rawAnswer]
              : [];
          return (
            <div key={questionKey}>
              <div className="sable-qa-q">{questionKey}</div>
              {picked.length > 0 ? (
                <div className="sable-qa-a">
                  {picked.map((answer) => (
                    <span key={answer} className="sable-qa-chip">
                      <Check className="h-3 w-3" />
                      {answer}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="sable-detail-quiet">No answer</div>
              )}
            </div>
          );
        })}
      </div>
    ) : undefined;

  const displayState = isWaitingForInput
    ? { ...state, interrupted: false }
    : state;

  return (
    <ToolLayout
      name="Ask user"
      summary={summary}
      meta={meta}
      state={displayState}
      icon={<MessageCircleQuestion className="h-3.5 w-3.5" />}
      nameClassName={state.denied || isDeclined ? "text-red-500" : undefined}
      expandedContent={expandedContent}
      defaultExpanded={Boolean(hasAnswers)}
    />
  );
}
