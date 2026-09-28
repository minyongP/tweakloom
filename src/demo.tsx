import { createRoot } from "react-dom/client";
import "./demo.css";

function Demo() {
  return (
    <div className="shop">
      <nav>
        <span className="brand" data-tweakloom-id="brand">
          studio / supply
        </span>
        <span>Objects for everyday focus</span>
        <a href="#collection" data-tweakloom-id="shop-link">
          Explore collection ↗
        </a>
      </nav>
      <main>
        <section className="hero">
          <div
            className="hero-copy"
            data-tweakloom-id="hero-content"
            data-tweakloom-container=""
          >
            <p className="eyebrow" data-tweakloom-id="eyebrow">
              LESS CLUTTER. MORE CLARITY.
            </p>
            <h1 data-tweakloom-id="hero-title">Make room for good work.</h1>
            <p className="intro" data-tweakloom-id="hero-description">
              Thoughtful tools for the space where your ideas take shape. A
              little calmer. A little more you.
            </p>
            <button data-tweakloom-id="hero-button">
              Find your essentials <span aria-hidden="true">↗</span>
            </button>
            <p className="small" data-tweakloom-id="shipping-note">
              Made with care. Designed to stay.
            </p>
          </div>
          <div
            className="still-life"
            data-tweakloom-id="hero-art"
            aria-label="Abstract desk objects in soft lilac and warm orange"
          >
            <div className="sun-disc"></div>
            <div className="notebook">
              <span>
                GOOD
                <br />
                THINGS
                <br />
                TAKE
                <br />
                SHAPE.
              </span>
            </div>
            <div className="cup">
              <div></div>
            </div>
            <div className="pencil"></div>
            <span className="art-caption">THE EVERYDAY COLLECTION — 01</span>
          </div>
        </section>
        <section className="collection" id="collection">
          <div className="section-title">
            <h2 data-tweakloom-id="collection-title">
              Small things. Better days.
            </h2>
            <span>Considered, not complicated.</span>
          </div>
          <div
            className="cards"
            data-tweakloom-id="collection-cards"
            data-tweakloom-container=""
          >
            <article data-tweakloom-id="card-notes" data-tweakloom-container="">
              <span className="number">01 / CAPTURE</span>
              <h3 data-tweakloom-id="notes-title">A place for ideas</h3>
              <p data-tweakloom-id="notes-description">
                Good paper. An open mind.
              </p>
              <span className="arrow">↗</span>
            </article>
            <article data-tweakloom-id="card-focus" data-tweakloom-container="">
              <span className="number">02 / FOCUS</span>
              <h3 data-tweakloom-id="focus-title">Clear some space</h3>
              <p data-tweakloom-id="focus-description">
                Less on your desk. More on your mind.
              </p>
              <span className="arrow">↗</span>
            </article>
            <article data-tweakloom-id="card-pause" data-tweakloom-container="">
              <span className="number">03 / RESET</span>
              <h3 data-tweakloom-id="pause-title">Take a little pause</h3>
              <p data-tweakloom-id="pause-description">
                The next good idea can wait a minute.
              </p>
              <span className="arrow">↗</span>
            </article>
          </div>
        </section>
        <section className="draft-board-section">
          <div className="section-title">
            <h2>Your draft board</h2>
            <span>Drop components here</span>
          </div>
          <div
            id="draft-board"
            data-tweakloom-id="draft-board"
            data-tweakloom-container=""
            aria-label="Draft board"
          />
        </section>
        <footer>
          <span>Everyday objects, thoughtfully made.</span>
          <span>studio / supply © 2026</span>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
// This explicit development-only hook is the Phase 1 integration boundary.
if (import.meta.env.DEV) void import("./bridge.ts");
