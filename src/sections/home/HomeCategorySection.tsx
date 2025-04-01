function HomeCategorySection() {
  const categories = [
    "Family",
    "Dinning",
    "Dinner",
    "Date",
    "Hangout",
    "Family",
    "Dinning",
    "Dinner",
    "Date",
    "Hangout",
  ];
  return (
    <div className="w-full bg-background rounded-lg p-2 flex items-center mt-2">
      <div className="w-full bg-background flex items-center gap-2 overflow-scroll scroll-hide">
        {categories.map((category, categoryIndex) => (
          <button
            className="bg-background200 text-white text-sm py-1 px-3 rounded-md"
            key={categoryIndex}
          >
            <small className="font-medium">{category}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export default HomeCategorySection;
