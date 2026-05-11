export const FIRST_DAY_TEAMS = [
  { value: 'MOT', label: 'MOT', icon: '🏢' },
  { value: 'MOE', label: 'MOE', icon: '🏫' },
  { value: 'Ruby Roses', label: 'Ruby Roses', icon: '🌹' },
  { value: 'Gentlemen', label: 'Gentlemen', icon: '🎩' },
  { value: 'TRT', label: 'TRT', icon: '📌' },
  { value: 'OBS', label: 'OBS', icon: '🎥' },
  { value: 'PyaeWa Land', label: 'PyaeWa Land', icon: '🏘️' },
] as const;

export type TeamVideoLinks = Record<string, string[]>;

export const DEFAULT_TEAM_VIDEO_LINKS: TeamVideoLinks = {
  MOT: ['https://vimeo.com/1104734792/a71bd80b2e'],
  MOE: [
    'https://vimeo.com/1104735436/013ccfebba',
    'https://vimeo.com/1104735513/608bd398d6',
  ],
  'Ruby Roses': ['https://vimeo.com/1103864915/14fb37e989'],
  Gentlemen: ['https://vimeo.com/1104735114/7eb770b366'],
  TRT: ['https://vimeo.com/1104734679/246e6af3de'],
  OBS: ['https://vimeo.com/1104740967'],
  'PyaeWa Land': ['https://vimeo.com/1104744582/54592462f7?share=copy'],
};

export function mergeTeamVideoLinks(saved?: unknown): TeamVideoLinks {
  const merged: TeamVideoLinks = { ...DEFAULT_TEAM_VIDEO_LINKS };

  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    for (const [team, links] of Object.entries(saved as Record<string, unknown>)) {
      if (Array.isArray(links)) {
        merged[team] = links.filter((link): link is string => typeof link === 'string');
      }
    }
  }

  return merged;
}

export function isProjectVideosTopic(topic: { id?: string; label?: string }) {
  const text = `${topic.id || ''} ${topic.label || ''}`.toLowerCase();
  return text.includes('project') && text.includes('video');
}
