-- =============================================================================
-- Conteúdo inicial (demonstração). Tudo pode ser editado ou removido no painel.
-- Não há preços, avaliações ou estatísticas inventadas.
-- =============================================================================

-- Linha única de configurações. O conteúdo padrão vem de src/config/brand.ts e
-- é sobrescrito pelo que for salvo aqui pelo painel.
insert into public.site_settings (id, data) values (1, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.services (name, description, category, icon, sort_order) values
  ('Revisão preventiva',
   'Inspeção completa dos itens de segurança e desgaste, seguindo o plano de manutenção indicado para o seu veículo.',
   'Manutenção', 'clipboard-check', 10),
  ('Troca de óleo e filtros',
   'Substituição de óleo e filtros com produtos adequados à especificação do fabricante.',
   'Manutenção', 'droplet', 20),
  ('Diagnóstico eletrônico',
   'Leitura de falhas com scanner automotivo e análise técnica para identificar a origem do problema.',
   'Diagnóstico', 'scan-line', 30),
  ('Freios e suspensão',
   'Avaliação e manutenção de pastilhas, discos, amortecedores e componentes de suspensão.',
   'Segurança', 'disc', 40),
  ('Motor e transmissão',
   'Diagnóstico e reparo de motor, embreagem e câmbio, com análise cuidadosa antes de qualquer intervenção.',
   'Mecânica', 'cog', 50),
  ('Sistema de arrefecimento',
   'Verificação de radiador, bomba d''água, mangueiras e fluido para evitar superaquecimento.',
   'Mecânica', 'thermometer', 60),
  ('Injeção eletrônica',
   'Limpeza, testes e regulagem do sistema de injeção para melhor funcionamento do motor.',
   'Diagnóstico', 'zap', 70),
  ('Ar-condicionado automotivo',
   'Higienização, verificação de gás e manutenção dos componentes do sistema de climatização.',
   'Conforto', 'snowflake', 80),
  ('Alinhamento e balanceamento',
   'Ajuste da geometria e balanceamento das rodas para mais estabilidade e menor desgaste dos pneus.',
   'Segurança', 'circle-dot', 90),
  ('Serviços especializados',
   'Precisa de algo específico? Descreva a necessidade e nossa equipe avalia o melhor caminho.',
   'Especializado', 'wrench', 100);

insert into public.faqs (question, answer, sort_order) values
  ('Como solicitar um orçamento?',
   'Clique em "Solicitar orçamento", preencha os dados do veículo e descreva o que está acontecendo. Depois de conferir o resumo, você envia a solicitação e nossa equipe entra em contato para dar continuidade.',
   10),
  ('Preciso entrar em contato antes de levar o veículo?',
   'Recomendamos que sim. Assim conseguimos entender a necessidade, orientar sobre o atendimento e combinar o melhor horário com você.',
   20),
  ('Como funciona o diagnóstico?',
   'Avaliamos o veículo e, quando necessário, utilizamos equipamentos de diagnóstico eletrônico. Em seguida explicamos o que foi identificado e quais são as alternativas.',
   30),
  ('O orçamento é confirmado antes da execução?',
   'Sim. Nenhum serviço é executado sem que você conheça e aprove o orçamento.',
   40),
  ('Quais formas de pagamento são aceitas?',
   'As formas de pagamento disponíveis são informadas pela equipe durante o atendimento. (Conteúdo demonstrativo — edite esta resposta no painel.)',
   50),
  ('Quais veículos são atendidos?',
   'Atendemos veículos de passeio e utilitários leves. Se tiver dúvida sobre o seu modelo, entre em contato. (Conteúdo demonstrativo — edite esta resposta no painel.)',
   60);

-- Galeria de demonstração com fotografias de banco de imagens (Unsplash).
-- Substitua pelas fotos reais da oficina pelo painel.
insert into public.gallery_images (image_url, caption, alt_text, category, sort_order) values
  ('https://images.unsplash.com/photo-1486262715619-67b85e0b08d3', 'Imagem ilustrativa', 'Mecânico trabalhando no motor de um carro', 'servicos', 10),
  ('https://images.unsplash.com/photo-1487754180451-c456f719a1fc', 'Imagem ilustrativa', 'Veículo em manutenção na oficina', 'oficina', 20),
  ('https://images.unsplash.com/photo-1492144534655-ae79c964c9d7', 'Imagem ilustrativa', 'Carro esportivo branco', 'detalhes', 30),
  ('https://images.unsplash.com/photo-1503376780353-7e6692767b70', 'Imagem ilustrativa', 'Detalhe frontal de um carro esportivo', 'detalhes', 40),
  ('https://images.unsplash.com/photo-1580273916550-e323be2ae537', 'Imagem ilustrativa', 'Carro esportivo azul em ambiente urbano', 'detalhes', 50),
  ('https://images.unsplash.com/photo-1494976388531-d1058494cdd8', 'Imagem ilustrativa', 'Carro clássico em destaque', 'detalhes', 60);
