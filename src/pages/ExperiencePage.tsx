import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import ExperienceHeroSection from "../sections/experience/ExperienceHeroSection";
import ExperienceCategoriesSection from "../sections/experience/ExperienceCategoriesSection";

function ExperiencePage() {
  return (
    <PrimaryPageContainer>
      <ExperienceHeroSection />
      <ExperienceCategoriesSection />
    </PrimaryPageContainer>
  );
}

export default ExperiencePage;
