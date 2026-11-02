export default function ProfileAvatar({ src, size = 256, ...props }) {
  return <img width={size} height={size} {...props} src={src} draggable={false} />;
}
