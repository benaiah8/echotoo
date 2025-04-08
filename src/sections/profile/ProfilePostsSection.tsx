import Post from "../../components/Post";

function ProfilePostsSection() {
  return (
    <div className="flex flex-col w-full gap-4 mt-6">
      {[...Array(10)].map((_, index) => (
        <Post key={index} />
      ))}
    </div>
  );
}

export default ProfilePostsSection;
