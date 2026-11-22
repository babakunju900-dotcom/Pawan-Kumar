import { GoogleGenAI, Type } from '@google/genai';

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

export interface AiCatalogContext {
  titles: Array<{
    id: number;
    title: string;
    type: string;
    genres: string[];
    language: string;
    viewsCount: number;
    rating: number;
    isFeatured: boolean;
    youtubeVideoId?: string | null;
  }>;
  totalUsers: number;
  premiumSubscribers: number;
  totalRevenue: number;
}

export async function runAdminAiTask(
  task:
    | 'suggest_categories'
    | 'generate_description'
    | 'recommend_posters'
    | 'detect_duplicates'
    | 'suggest_featured'
    | 'generate_tags'
    | 'analyze_trends'
    | 'weekly_report',
  input: { title?: string; notes?: string; genres?: string[]; language?: string },
  context: AiCatalogContext
) {
  const ai = getAiClient();

  const promptMap: Record<typeof task, string> = {
    suggest_categories: `Suggest the optimal OTT category, 3-4 genres, age rating, and content shelf placements for title "${input.title || 'Untitled'}" (language: ${input.language || 'English'}, notes: ${input.notes || 'none'}).`,
    generate_description: `Write a compelling, prestige streaming synopsis (2-3 crisp sentences, editorial cinema tone, no spoilers) for "${input.title || 'Untitled'}" (${input.language || 'English'}, genres: ${(input.genres || []).join(', ')}, notes: ${input.notes || 'none'}).`,
    recommend_posters: `Recommend 3 distinct theatrical poster key-art concepts (composition, color palette, typography hierarchy, mood) for "${input.title || 'Untitled'}" (${(input.genres || []).join(', ')}) tailored to a dark luxury OTT platform.`,
    detect_duplicates: `Inspect this catalog list and detect any potential duplicate or overlapping titles, remakes, or repeated YouTube IDs. Catalog: ${JSON.stringify(context.titles)}`,
    suggest_featured: `Based on views, ratings, and genre balance in this catalog, recommend the top 3 titles to promote in the Hero Banner this week with concrete rationale. Catalog: ${JSON.stringify(context.titles)}`,
    generate_tags: `Generate 8-12 high-discovery OTT search tags, mood descriptors, and recommendation keywords for "${input.title || 'Untitled'}" (notes: ${input.notes || 'none'}).`,
    analyze_trends: `Analyze current viewing trends across languages, genres, and formats from this platform dataset and suggest 4 actionable programming moves. Dataset: ${JSON.stringify(context)}`,
    weekly_report: `Generate an executive Weekly OTT Performance & Programming Report covering catalog engagement, subscriber conversion (${context.premiumSubscribers}/${context.totalUsers}), revenue (INR ${context.totalRevenue}), top performers, and next-week editorial priorities. Dataset: ${JSON.stringify(context)}`,
  };

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: promptMap[task],
    config: {
      systemInstruction:
        'You are the KinoStage Editorial & Programming AI Assistant for Super Administrators. Every output is a draft requiring administrator review before publishing. Keep insights concise, structured, accurate to the provided dataset, and free of hype.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING, description: 'Short summary heading for the draft.' },
          summary: { type: Type.STRING, description: 'Main generated text or executive analysis.' },
          suggestedItems: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Actionable suggestions, tags, categories, or duplicate flags.',
          },
          reviewChecklist: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-3 items the administrator should verify before publishing.',
          },
        },
        required: ['headline', 'summary', 'suggestedItems', 'reviewChecklist'],
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  return JSON.parse(text) as {
    headline: string;
    summary: string;
    suggestedItems: string[];
    reviewChecklist: string[];
  };
}
