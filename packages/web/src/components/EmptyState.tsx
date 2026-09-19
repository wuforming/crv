export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-[#8b949e]">{text}</p>
    </div>
  );
}
