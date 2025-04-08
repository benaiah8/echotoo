import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import ProfileHeroSection from "../sections/profile/ProfileHeroSection";
import ProfileHeaderSection from "../sections/profile/ProfileHeaderSection";
import ProfileHangoutSection from "../sections/profile/ProfileHangoutSection";
import ProfilePostsSection from "../sections/profile/ProfilePostsSection";

function ProfilePage() {
  return (
    <PrimaryPageContainer>
      <ProfileHeaderSection />
      <ProfileHeroSection />
      <ProfileHangoutSection />
      <ProfilePostsSection />
    </PrimaryPageContainer>
  );
}

export default ProfilePage;
