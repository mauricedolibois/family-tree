# Family Tree 🌳👨‍👩‍👦

An interactive web application for visualizing, managing, and analyzing family genealogy. Built with modern web technologies and featuring a sophisticated layout algorithm for beautiful hierarchical tree visualization.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Development](#development)
- [Testing](#testing)
- [Building & Deployment](#building--deployment)
- [Architecture & Algorithm](#architecture--algorithm)
- [Data Structures & Relationships](#data-structures--relationships)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Contributing](#contributing)

## Features

✨ **Core Features:**
- **Interactive Family Tree Visualization** - Beautiful hierarchical tree layout with graph optimization
- **Member Management** - Add, edit, and manage family members with detailed profiles
- **Relationship Tracking** - Query and determine relationships between family members
- **Media Gallery** - Store and manage photos/media for family members
- **User Authentication** - Secure login and registration system
- **Gender-based Coloring** - Visual distinction (blue for males, pink for females)
- **Responsive Design** - Works seamlessly on desktop and mobile devices

🔬 **Advanced Features:**
- **Graph Layout Algorithm** - Implements Sugiyama algorithm to minimize edge crossings
- **Intelligent Child Ordering** - Children sorted by birth date and parent position
- **Couple Units** - Keeps married couples together in visualization
- **Multi-generation Support** - Handles unlimited family depth
- **Custom Styling** - Tailored gaps, sizes, and spacing

## Quick Start

```bash
# Clone the repository
git clone https://gitlab.lptzocker.com/lptzocker/family-tree.git
cd family-tree

# Install dependencies
cd app
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18+ (v20 recommended)
- [npm](https://www.npmjs.com/) or yarn
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

## Installation

1. **Clone the repository:**
```bash
git clone https://gitlab.lptzocker.com/lptzocker/family-tree.git
cd family-tree
```

2. **Install dependencies:**
```bash
cd app && npm install
```

3. **Configure environment variables:**
```bash
# In the app/ directory, create a .env.local file
cp example.env prod.env

# Update with your Supabase credentials:
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Development

### Running the Development Server

```bash
cd app
npm run dev
```

Access the application at `http://localhost:3000`

### Code Quality

```bash
# Format code with Prettier
npm run format

# Check code style
npm run check-format

# Lint with ESLint
npm run check-lint

# Type check with TypeScript
npm run check-types

# All checks together
npm run precommit
```

## Testing

### Running Tests

```bash
cd app

# Run all tests
npm test

# Run tests in watch mode
npm run start

# Run specific test file
npm test -- path/to/test.test.ts
```

### Test Coverage

Tests cover:
- Component rendering and interactions
- Family tree data structure operations
- Relationship calculations
- Layout algorithm correctness
- Utility functions

## Building & Deployment

### Production Build

```bash
cd app
npm run build
npm run prod
```

### Docker Deployment

The application uses a multi-stage Docker build for optimized production deployments.

```bash
# 1. Create production environment file (required for Docker)
cp example.env prod.env

# 2. Update prod.env with your Supabase credentials
# NEXT_PUBLIC_SUPABASE_URL=your_url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
# SUPABASE_SERVICE_ROLE_KEY=your_key

# 3. Build and run with Docker Compose
docker compose up --build

# Access at http://localhost:3000
```

**How Docker works:**
- `docker-compose.yml` - Orchestrates the app container
- `app/Dockerfile` - Multi-stage build (builder + runner)
- Requires `prod.env` in root directory (loaded by docker-compose)
- Runs `npm run prod` (production server)

### Environment Variables

#### Development (`.env.local` in `app/` directory)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

#### Production/Docker (`prod.env` in root directory)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Important:** Docker expects `prod.env` in the root directory, not `app/.env.local`

## Architecture & Algorithm

### Why a Tree Data Structure?

According to [Wikipedia](https://en.wikipedia.org/wiki/Family_tree):
> "A family tree, also called a genealogy or a pedigree chart, is a chart representing family relationships in a conventional tree structure."

A tree data structure is ideal for family genealogy because:
- **Hierarchical** - Natural representation of parent-child relationships
- **Efficient traversal** - Fast member searches and relationship queries using BFS
- **Scalable** - Handles arbitrary family depth and complexity
- **Intuitive** - Visually mirrors how we understand family relationships

### Graph Layout Algorithm (Sugiyama/Barycenter Method)

The application implements the **Sugiyama algorithm** for hierarchical graph layout to create visually clear and aesthetically pleasing family trees:

#### Algorithm Steps:

1. **Generation Assignment** 
   - Members assigned to generations (layers) via BFS from root
   - Root member = Generation 0
   - Parents = Negative generations (-1, -2, ...)
   - Children = Positive generations (+1, +2, ...)
   - Spouses = Same generation as their partner

2. **Supernode Creation**
   - Married couples grouped as single "supernode" units
   - Keeps couples adjacent in visualization
   - Single members remain individual nodes

3. **Crossing Minimization (Median/Barycenter Heuristic)**
   - Alternating sweeps: top-down and bottom-up
   - Each member positioned at median of parent/child positions
   - Reduces edge crossings for clearer visualization
   - Continues until convergence (max 8 iterations)

4. **Block Formation**
   - Parent row: Couple units + single members
   - Child row: Groups of children from same parents
   - Blocks organized with minimum spacing

5. **Position Refinement**
   - Centers child blocks under parent centers
   - Prevents overlaps via L→R and R→L sweeps
   - Final positioning respects constraints

#### Key Files:
- [ordering.ts](app/src/utils/layout/ordering.ts) - Sugiyama algorithm implementation
- [blocks.ts](app/src/utils/layout/blocks.ts) - Block formation and packing
- [children.ts](app/src/utils/layout/children.ts) - Child ordering logic
- [helpers.ts](app/src/utils/layout/helpers.ts) - Generation assignment (BFS)

## Data Structures & Relationships

#### Core Data Models

**Member**
```typescript
{
  id: string                    // Unique identifier
  name: string
  gender: 'MALE' | 'FEMALE'
  spouseId?: string             // ID of spouse (if married)
  parentIds: string[]           // IDs of biological parents
  childrenIds: string[]         // IDs of biological children
  birthDate?: string            // ISO format: YYYY-MM-DD
  raw?: {
    profile?: {
      comments?: string
      // ... other metadata
    }
  }
}
```

**Family Tree**
```typescript
{
  version: number               // Data format version
  rootId: string                // ID of root member
  members: Record<string, Member>  // All members by ID
}
```

#### Relationship Types Supported

```typescript
// Direct Relations
FATHER | MOTHER | SON | DAUGHTER | SPOUSE

// Siblings
BROTHER | SISTER | SIBLING | BROTHER-IN-LAW | SISTER-IN-LAW

// Extended Family
PATERNAL-UNCLE | PATERNAL-AUNT | MATERNAL-UNCLE | MATERNAL-AUNT
COUSIN | COUSIN-IN-LAW | GRAND-SON | GRAND-DAUGHTER | GRAND-CHILD

// In-Laws
FATHER-IN-LAW | MOTHER-IN-LAW | SON-IN-LAW | DAUGHTER-IN-LAW

// Advanced Queries
ANCESTOR | DESCENDANT
```

#### Relationship Query Algorithm

The application uses graph traversal to determine relationships:

1. **Direct relationships** - Immediate connections via parentIds/childrenIds/spouseId
2. **Extended relationships** - BFS from source to target member
3. **In-law relationships** - Traversing through spouse connections
4. **Multi-generational** - Computing paths through ancestors/descendants

Query engine: [bloodline.ts](app/src/utils/bloodline.ts)

### Implementation Constraints

The solution follows these design constraints:

1. **Only married couples can have children** - Prevents invalid parent relationships
2. **Monogamy enforced** - Each member can have at most one spouse
3. **Unique names** - Family members must have unique identifiers
4. **Case-sensitive** - Name comparisons are case-sensitive
5. **Spouse consistency** - Spouse relationship is bidirectional

## Project Structure

```
family-tree/
├── app/                           # Next.js application
│   ├── src/
│   │   ├── components/            # React components
│   │   │   ├── FamilyTree.tsx      # Main tree visualization
│   │   │   ├── FamilyTreeProvider.tsx  # State management
│   │   │   ├── AddMember.tsx       # Add member form
│   │   │   ├── SearchMember.tsx    # Member search interface
│   │   │   ├── SearchRelationship.tsx   # Relationship query UI
│   │   │   └── memberDetails/      # Member detail views
│   │   │       ├── EditView.tsx
│   │   │       ├── DetailsView.tsx
│   │   │       └── EditableMediaGallery.tsx
│   │   ├── utils/
│   │   │   ├── layout/             # Layout algorithm (Sugiyama)
│   │   │   │   ├── ordering.ts     # Core Sugiyama implementation
│   │   │   │   ├── blocks.ts       # Block formation
│   │   │   │   ├── children.ts     # Child ordering
│   │   │   │   ├── spouses.ts      # Spouse positioning
│   │   │   │   ├── helpers.ts      # Generation assignment (BFS)
│   │   │   │   ├── types.ts        # Type definitions
│   │   │   │   └── debug.ts        # Debug utilities
│   │   │   ├── bloodline.ts        # Relationship query engine
│   │   │   ├── familyLayout.ts     # Main layout orchestration
│   │   │   └── constants.ts        # Configuration constants
│   │   ├── models/
│   │   │   ├── FamilyTree.ts       # Tree data structure
│   │   │   ├── Member.ts           # Member model
│   │   │   └── family/
│   │   │       ├── queries.ts      # Graph queries
│   │   │       ├── mutations.ts    # Data modifications
│   │   │       ├── traverse.ts     # Tree traversal utilities
│   │   │       └── types.ts        # Domain types
│   │   ├── pages/                  # Next.js pages
│   │   │   ├── index.tsx           # Main tree view
│   │   │   ├── auth.tsx            # Authentication
│   │   │   ├── _app.tsx            # App wrapper
│   │   │   └── api/                # API routes
│   │   │       ├── family.ts       # Family tree operations
│   │   │       ├── media.ts        # Media operations
│   │   │       └── auth/           # Authentication routes
│   │   ├── types/                  # TypeScript definitions
│   │   │   ├── family.ts           # Core domain types
│   │   │   ├── IMember.ts          # Member interface
│   │   │   ├── Gender.ts           # Gender enum
│   │   │   └── Relationship.ts     # Relationship types
│   │   ├── lib/                    # Backend utilities
│   │   │   ├── db.ts               # Database client
│   │   │   ├── supabaseServer.ts   # Server-side Supabase
│   │   │   ├── accounts.ts         # Account management
│   │   │   └── apiLogger.ts        # Request logging
│   │   ├── storage/                # Data persistence
│   │   │   ├── schema.ts           # Database schema
│   │   │   ├── serverFile.ts       # File storage
│   │   │   ├── simple.ts           # Simple storage
│   │   │   └── rebuild.ts          # Data rebuild utilities
│   │   ├── config/                 # Configuration
│   │   │   └── layout.ts           # Layout constants
│   │   ├── styles/                 # CSS/styling
│   │   │   ├── globals.css
│   │   │   └── colors.css
│   │   └── debug/                  # Debug utilities
│   │       └── serializeTagged.ts  # Serialization helpers
│   ├── public/                     # Static assets
│   ├── jest.config.mjs             # Jest testing config
│   ├── jest.setup.js               # Jest setup
│   ├── next.config.js              # Next.js config
│   ├── tailwind.config.js          # Tailwind CSS config
│   ├── postcss.config.js           # PostCSS config
│   ├── tsconfig.json               # TypeScript config
│   ├── .eslintignore               # ESLint ignore rules
│   ├── .prettierignore             # Prettier ignore rules
│   └── package.json                # Dependencies
├── scripts/                        # Utility scripts
│   └── keep-alive.mjs              # Database keep-alive
├── docker-compose.yml              # Docker compose config
├── Dockerfile                      # Container configuration
├── example.env                     # Environment template
└── README.md                       # This file
```

## Technology Stack

### Frontend
- **[Next.js 13](https://nextjs.org/)** - React framework with server-side rendering
- **[React 18](https://react.dev/)** - UI component library
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe JavaScript
- **[TailwindCSS 3](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Zendesk Garden](https://garden.zendesk.com/)** - Professional UI components

### Graph & Layout
- **[ReactFlow](https://reactflow.dev/)** - Interactive graph library
- **[Dagre](https://github.com/dagrejs/dagre)** - Graph layout library
- **[react-d3-tree](https://react-d3-tree.com/)** - D3-based tree visualization

### Backend & Database
- **[Supabase](https://supabase.com/)** - PostgreSQL + Auth + Storage
- **[Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)** - Serverless backend

### Testing
- **[Jest](https://jestjs.io/)** - JavaScript testing framework
- **[React Testing Library](https://testing-library.com/)** - Component testing utilities

### Development Tools
- **[ESLint](https://eslint.org/)** - Code linting
- **[Prettier](https://prettier.io/)** - Code formatting
- **[TypeScript Compiler](https://www.typescriptlang.org/)** - Type checking

## Key Files Reference

| File | Purpose |
|------|---------|
| [familyLayout.ts](app/src/utils/familyLayout.ts) | Main layout orchestration engine |
| [ordering.ts](app/src/utils/layout/ordering.ts) | Sugiyama algorithm implementation |
| [bloodline.ts](app/src/utils/bloodline.ts) | Relationship query engine |
| [FamilyTreeProvider.tsx](app/src/components/FamilyTreeProvider.tsx) | State management context |
| [FamilyTree.tsx](app/src/components/FamilyTree.tsx) | Tree visualization component |

## Roadmap

### Current Features ✅
- Interactive tree visualization with graph optimization
- Member CRUD operations (create, read, update, delete)
- Comprehensive relationship queries
- Media gallery management
- User authentication & authorization
- Responsive UI design

### Future Enhancements 🚀
- [ ] Custom tree themes and styling
- [ ] Export tree as PDF/PNG/SVG
- [ ] Advanced analytics and statistics
- [ ] Collaborative editing (real-time sync)
- [ ] Mobile app (React Native)
- [ ] Ancestry.com/Familysearch.org integration
- [ ] Timeline view by generation
- [ ] Photo organization and tagging
- [ ] Error handling improvements
- [ ] Toast notifications for user feedback

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'feat: add your feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open a Pull Request

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `style:` formatting
- `refactor:` code restructuring
- `test:` adding tests
- `chore:` maintenance

---

**Happy family tree building! 🌳**