import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const projectsDir = path.resolve(__dirname, 'projects');

// Ensure projects directory exists
if (!fs.existsSync(projectsDir)) {
  fs.mkdirSync(projectsDir, { recursive: true });
}

// Support large payloads (Base64 images loaded locally)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve built frontend assets in production
app.use(express.static(path.join(__dirname, 'dist')));

// ==================== DATABASE API ENDPOINTS ====================

// GET /api/projects - List all projects
app.get('/api/projects', (req, res) => {
  try {
    const files = fs.readdirSync(projectsDir);
    const list = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(projectsDir, file);
        const stats = fs.statSync(filePath);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          return {
            id: content.id || path.basename(file, '.json'),
            name: content.name || 'Sin Título',
            updatedAt: stats.mtime,
            size: stats.size
          };
        } catch (e) {
          return {
            id: path.basename(file, '.json'),
            name: path.basename(file, '.json'),
            updatedAt: stats.mtime,
            size: stats.size,
            error: 'Archivo corrupto'
          };
        }
      })
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    res.json(list);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar proyectos', details: error.message });
  }
});

// POST /api/projects - Create new project
app.post('/api/projects', (req, res) => {
  try {
    const name = req.body?.name || 'Nuevo Proyecto';
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 30) || 'project';
    const id = `${safeName}-${Date.now()}`;
    const newProjectPath = path.join(projectsDir, `${id}.json`);

    const newProjectData = {
      id,
      name,
      activeBoardId: 'root',
      boards: {
        root: {
          id: 'root',
          name: 'Inicio',
          cards: [],
          connections: []
        }
      }
    };

    fs.writeFileSync(newProjectPath, JSON.stringify(newProjectData, null, 2), 'utf-8');
    res.status(201).json(newProjectData);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear proyecto', details: error.message });
  }
});

// GET /api/projects/:id - Load specific project
app.get('/api/projects/:id', (req, res) => {
  try {
    const id = req.params.id;
    const projectPath = path.join(projectsDir, `${id}.json`);

    if (fs.existsSync(projectPath)) {
      const content = fs.readFileSync(projectPath, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.send(content);
    } else {
      res.status(404).json({ error: 'Proyecto no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar', details: error.message });
  }
});

// POST /api/projects/:id - Save specific project
app.post('/api/projects/:id', (req, res) => {
  try {
    const id = req.params.id;
    const projectPath = path.join(projectsDir, `${id}.json`);
    const body = req.body;

    if (!body) {
      return res.status(400).json({ error: 'Falta el cuerpo del JSON' });
    }

    fs.writeFileSync(projectPath, JSON.stringify(body, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar', details: error.message });
  }
});

// DELETE /api/projects/:id - Delete project
app.delete('/api/projects/:id', (req, res) => {
  try {
    const id = req.params.id;
    const projectPath = path.join(projectsDir, `${id}.json`);

    if (fs.existsSync(projectPath)) {
      fs.unlinkSync(projectPath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Proyecto no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar', details: error.message });
  }
});

// POST /api/projects/:id/clone - Clone project
app.post('/api/projects/:id/clone', (req, res) => {
  try {
    const id = req.params.id;
    const sourcePath = path.join(projectsDir, `${id}.json`);

    if (fs.existsSync(sourcePath)) {
      const content = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
      const newId = `${content.id}-copia-${Date.now()}`;
      content.id = newId;
      content.name = `${content.name} (Copia)`;
      const newPath = path.join(projectsDir, `${newId}.json`);

      fs.writeFileSync(newPath, JSON.stringify(content, null, 2), 'utf-8');
      res.status(201).json(content);
    } else {
      res.status(404).json({ error: 'Proyecto de origen no encontrado' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al clonar', details: error.message });
  }
});

// Fallback to SPA index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`LuminaBoard en producción corriendo en: http://localhost:${PORT}`);
});
