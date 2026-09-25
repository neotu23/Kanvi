import { ThemeWorkspace } from '../components/ThemeWorkspace';
export default async function Page({ searchParams }: { searchParams: Promise<{ theme?: string }> }) {
  const { theme } = await searchParams;
  return <ThemeWorkspace initialThemeId={typeof theme === 'string' ? theme : ''} />;
}
