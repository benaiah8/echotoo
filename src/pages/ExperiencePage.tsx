import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import ExperienceHeroSection from "../sections/experience/ExperienceHeroSection";
import ExperienceCategoriesSection from "../sections/experience/ExperienceCategoriesSection";
import ExperienceActivitiesSection from "../sections/experience/ExperienceActivitiesSection";

function ExperiencePage() {
  return (
    <PrimaryPageContainer back>
      <ExperienceHeroSection />
      <ExperienceCategoriesSection />
      <ExperienceActivitiesSection />
    </PrimaryPageContainer>
  );
}

export default ExperiencePage;
