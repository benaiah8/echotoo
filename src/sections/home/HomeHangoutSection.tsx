import Hangout from "../../components/Hangout";

function HomeHangoutSection() {
  return (
    <div className="w-full flex gap-3 scroll-hide overflow-scroll mt-3">
      {[...Array(10)].map((_, index) => (
        <Hangout key={index} />
      ))}
    </div>
  );
}

export default HomeHangoutSection;
