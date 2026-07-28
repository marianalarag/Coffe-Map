import { useEffect, useMemo, useState } from 'react';
import { Heart, MessageCircle, MoreHorizontal, Send } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';

const getAvatar = (user, profile) => profile?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(user?.email || 'coffee-user')}`;
const fallbackImage = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=85';

function ActivityPage() {
  const { user, userProfile } = useAuth();
  const { cafes, cafesLoaded, loadCafes, interactions } = useCoffeeData();
  const [posts] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem('coffee-map:posts') || '[]');
    } catch {
      return [];
    }
  });
  const username = userProfile?.username || user?.email?.split('@')[0] || 'coffee lover';
  const avatar = getAvatar(user, userProfile);

  useEffect(() => {
    if (!cafesLoaded) loadCafes().catch(() => {});
  }, [cafesLoaded, loadCafes]);

  const featuredCafe = useMemo(() => cafes.find((cafe) => cafe.imageUrl) || cafes[0], [cafes]);
  const savedCafe = useMemo(() => {
    const savedId = interactions.find((item) => item.is_favorite || item.in_waitlist)?.cafe_id;
    return cafes.find((cafe) => cafe.id === savedId) || featuredCafe;
  }, [cafes, featuredCafe, interactions]);
  const featuredImage = featuredCafe?.imageUrl || fallbackImage;
  const featuredRating = Number(featuredCafe?.rating || 4.5).toFixed(1);

  return (
    <main className="social-page activity-page">
      <div className="social-shell activity-shell">
        <header className="activity-header">
          <span>Activity</span>
          <img src={avatar} alt="Tu perfil" />
        </header>

        <div className="activity-feed">
          {posts.map((post) => (
            <article className="activity-post" key={post.id}>
              <PostHeader avatar={post.avatar || avatar} name={post.username || username} />
              <p className="activity-post-copy">{post.content}</p>
              <div className="activity-post-actions"><Heart size={18} /><MessageCircle size={18} /><Send size={17} /></div>
            </article>
          ))}

          {featuredCafe && (
            <article className="activity-post">
              <PostHeader avatar={avatar} name={username} />
              <h2>{featuredCafe.nombre} <span className="activity-stars">★★★★★</span></h2>
              <div className="activity-review-grid">
                <img src={featuredImage} alt={featuredCafe.nombre} />
                <p>De las mejores cafeterías que he probado. Muy lindo el lugar.<br />El café estuvo increíble y volvería sin pensarlo.</p>
              </div>
              <div className="activity-post-actions"><Heart size={18} /><MessageCircle size={18} /><Send size={17} /></div>
            </article>
          )}

          {savedCafe && (
            <article className="activity-mini-event">
              <img src={avatar} alt="" />
              <span><strong>{username}</strong> agregó <b>{savedCafe.nombre}</b> a su lista</span>
              <Heart size={16} fill="currentColor" />
            </article>
          )}

          {featuredCafe && (
            <article className="activity-post activity-post-secondary">
              <PostHeader avatar={avatar} name={username} />
              <h2>{featuredCafe.nombre} <span className="activity-stars">{featuredRating} ★★★★★</span></h2>
              <div className="activity-review-grid"><img src={featuredImage} alt={featuredCafe.nombre} /><p>Un lugar tranquilo para disfrutar el café y pasar un buen rato con amigos.</p></div>
            </article>
          )}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}

function PostHeader({ avatar, name }) {
  return <div className="activity-post-header"><img src={avatar} alt="" /><span>{name}</span><small>1 día</small><MoreHorizontal size={16} /></div>;
}

export default ActivityPage;
