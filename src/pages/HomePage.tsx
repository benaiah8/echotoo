import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import HomeCategorySection from "../sections/home/HomeCategorySection";
import HomeFavoriteSection from "../sections/home/HomeFavoriteSection";
import HomeSearchSection from "../sections/home/HomeSearchSection";

function HomePage() {
  return (
    <PrimaryPageContainer>
      <div className="w-full flex flex-col sticky top-0 pt-3 pb-1 bg-black z-20">
        <HomeSearchSection />
        <HomeCategorySection />
      </div>
      <div className="w-full px-[1px] flex flex-col">
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
        <HomeFavoriteSection />
      </div>
    </PrimaryPageContainer>
  );
}

export default HomePage;
