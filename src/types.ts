export interface PodcastLine {
  speaker: 'Lucas' | 'Mariana';
  text: string;
}

export interface StudySession {
  id: string;
  title: string;
  topic: string;
  summary: string;
  contentMarkdown: string;
  podcastScript: PodcastLine[];
  podcastAudioUrl?: string; // Cache the generated blob URL for the current session
  podcastStyle: 'fun' | 'academic' | 'interview';
  createdAt: string;
}

export interface FileData {
  base64: string;
  name: string;
  mimeType: string;
}
