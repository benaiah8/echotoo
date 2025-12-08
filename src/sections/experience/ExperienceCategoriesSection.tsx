function ExperienceCategoriesSection() {
  const items = ["Family", "Dinner", "Date", "Hangout", "Hangout", "Hangout"];
  return (
    <div className="w-full rounded-md px-4 py-2 flex flex-col bg-[var(--surface-2)] mt-2">
      <span className="font-medium mb-2">Categories</span>
      <div className="flex flex-wrap w-full gap-1 pb-2">
        {items.map((item, index) => (
          <span
            key={index}
            className="px-2 py-1 !text-xs rounded-md bg-[var(--surface-2)]200 text-[var(--text)]"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export default ExperienceCategoriesSection;
