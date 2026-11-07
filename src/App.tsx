import { useEffect } from 'react';
import { useBrain } from './store/useBrain';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { TemplatePicker } from './components/TemplatePicker';
import { SplitLayout } from './layout/SplitLayout';
import { useTemplate, useTree } from './layout/useLayout';

export default function App() {
  const autoConnect = useBrain(s => s.autoConnect);
  const refreshConfig = useBrain(s => s.refreshConfig);
  const template = useTemplate();
  const tree = useTree();

  useEffect(() => {
    autoConnect();
    refreshConfig();
  }, []);

  return (
    <>
      <Header />
      {/* key: a new template remounts its panels instead of reusing another template's */}
      <SplitLayout key={template.id} layout={tree} />
      <TemplatePicker />
      <Toast />
    </>
  );
}
