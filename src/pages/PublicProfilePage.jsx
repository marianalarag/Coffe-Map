import { useEffect, useState } from 'react';
import { ArrowLeft, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';
import PageLoading from '../components/PageLoading';
import { supabase } from '../supabase';
import { ActivityFeed } from './ActivityPage';

const fallbackAvatar = (seed) => `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(seed || 'coffee-user')}`;

export default function PublicProfilePage({ profileId }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.from('profiles').select('id,username,avatar_url,cover_url,text_color').eq('id', profileId).maybeSingle()
      .then(({ data }) => { if (active) setProfile(data || null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profileId]);

  if (loading) return <PageLoading message="Cargando perfil…" />;

  return (
    <main className="social-page public-profile-page">
      <div className="social-shell public-profile-shell">
        <header className="public-profile-header" style={profile?.cover_url ? { backgroundImage: `linear-gradient(rgba(29,26,21,.3), rgba(29,26,21,.9)), url(${profile.cover_url})` } : undefined}>
          <button type="button" className="public-profile-back" onClick={() => navigate(-1)} aria-label="Regresar"><ArrowLeft size={21} /></button>
          {profile ? <img src={profile.avatar_url || fallbackAvatar(profile.username)} alt="" /> : <UserRound size={42} />}
          <h1>{profile?.username || 'Coffee lover'}</h1>
        </header>
        <section className="public-profile-activity">
          <h2>Publicaciones</h2>
          <ActivityFeed userIdFilter={profileId} compact />
        </section>
      </div>
      <BottomNav />
    </main>
  );
}
