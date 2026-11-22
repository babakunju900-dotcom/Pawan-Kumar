export interface UserProfile {
  uid: string;
  email: string;
  phone: string;
  username: string;
  avatarUrl: string;
  role: 'user' | 'moderator' | 'broadcaster' | 'admin';
  status: 'active' | 'suspended' | 'blocked';
  subscriptionTier: 'free' | 'monthly' | 'yearly';
  subscriptionExpiresAt: string | null;
  preferredLanguages: string[];
  maxAgeRating: string;
}

export interface EpisodeItem {
  id: number;
  seasonId: number;
  seriesId: number;
  episodeNumber: number;
  title: string;
  description: string;
  posterUrl: string;
  durationMinutes: number;
  videoSourceType: 'youtube' | 'hls' | 'dash' | 'direct';
  videoUrl: string;
  releaseDate: string;
}

export interface SeasonItem {
  id: number;
  seriesId: number;
  seasonNumber: number;
  title: string;
  releaseYear: number;
  episodes: EpisodeItem[];
}

export interface ReviewItem {
  id: number;
  titleId: number;
  userUid: string;
  username: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface TitleItem {
  id: number;
  slug: string;
  type: 'movie' | 'series';
  title: string;
  description: string;
  posterUrl: string;
  backdropUrl: string;
  trailerYoutubeId: string | null;
  videoSourceType: 'youtube' | 'hls' | 'dash' | 'direct';
  videoUrl: string;
  youtubeVideoId: string | null;
  releaseYear: number;
  durationMinutes: number;
  language: string;
  genres: string[];
  castList: string[];
  director: string;
  rating: number;
  ageRating: string;
  category: string;
  tags: string[];
  isFeatured: boolean;
  isTrending: boolean;
  top10Rank: number | null;
  isLatest: boolean;
  isPremium: boolean;
  published: boolean;
  viewsCount: number;
  rightsOwner: string;
  rightsType: string;
  allowedRegions: string[];
  createdAt: string;
  seasons?: SeasonItem[];
  reviews?: ReviewItem[];
}

export interface RealityCamera {
  id: number;
  showId: number;
  name: string;
  zone: string;
  streamType: 'hls' | 'youtube' | 'direct';
  hlsPlaybackUrl: string;
  rtmpIngestUrl: string;
  streamKeyHint: string;
  isOnline: boolean;
  viewerCount: number;
  isRecording: boolean;
  sortOrder: number;
}

export interface RealityParticipant {
  id: number;
  showId: number;
  name: string;
  role: string;
  bio: string;
  avatarUrl: string;
  status: 'active' | 'nominated' | 'evicted';
  votesCount: number;
}

export interface RealityEpisode {
  id: number;
  showId: number;
  title: string;
  kind: 'upcoming' | 'previous' | 'highlight' | 'replay';
  airDate: string;
  durationMinutes: number;
  thumbnailUrl: string;
  videoSourceType: 'hls' | 'youtube' | 'direct';
  videoUrl: string;
}

export interface RealityShowItem {
  id: number;
  name: string;
  slug: string;
  logoUrl: string;
  coverUrl: string;
  description: string;
  isLive: boolean;
  episodeSchedule: string;
  viewerCount: number;
  cameras: RealityCamera[];
  participants: RealityParticipant[];
  episodes: RealityEpisode[];
}

export interface LiveChannelItem {
  id: number;
  name: string;
  logoUrl: string;
  bannerUrl: string;
  category: string;
  language: string;
  streamType: 'hls' | 'youtube' | 'rtmp';
  hlsUrl: string;
  youtubeEmbedId: string | null;
  rtmpIngestUrl: string | null;
  streamKeyHint: string | null;
  status: 'live' | 'offline' | 'scheduled';
  currentProgram: string;
  scheduleJson: Array<{ time: string; program: string; duration: string }>;
  viewerCount: number;
  isPremium: boolean;
}

export interface LiveEventItem {
  id: number;
  title: string;
  description: string;
  bannerUrl: string;
  category: string;
  startsAt: string;
  status: 'upcoming' | 'live' | 'ended';
  streamType: string;
  streamUrl: string;
  isPremium: boolean;
  rsvpCount: number;
}

export interface StudioStreamItem {
  id: number;
  hostUid: string;
  hostName: string;
  title: string;
  description: string;
  category: string;
  thumbnailUrl: string;
  status: 'idle' | 'live' | 'ended';
  rtmpIngestUrl: string;
  hlsPlaybackUrl: string;
  streamKeyHint: string;
  recordingUrl: string | null;
  saveRecording: boolean;
  viewerCount: number;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ChatMessageItem {
  id: number;
  roomId: string;
  userUid: string;
  username: string;
  userRole: string;
  message: string;
  isPinned: boolean;
  isReported: boolean;
  createdAt: string;
}

export interface LivePollItem {
  id: number;
  roomId: string;
  question: string;
  optionsJson: Array<{ id: string; label: string; votes: number }>;
  isActive: boolean;
}

export interface SubscriptionPlanItem {
  id: number;
  code: 'free' | 'monthly' | 'yearly';
  name: string;
  priceInr: number;
  priceUsd: number;
  billingCycle: string;
  featuresJson: string[];
  maxQuality: string;
  adsSupported: boolean;
  isActive: boolean;
}

export interface TransactionItem {
  id: number;
  userUid: string;
  userEmail: string;
  planCode: string;
  amount: number;
  currency: string;
  paymentMethod: 'upi' | 'qr' | 'card_gateway';
  referenceId: string;
  status: 'pending_verification' | 'verified' | 'rejected' | 'refunded';
  adminNote: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  type: string;
  targetAudience: string;
  createdAt: string;
}
