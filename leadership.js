
/* =========================================================
   KULZZY UNIVERSAL LEADERSHIP CHALLENGE
   COMPLETE LEADERSHIP SYSTEM
   File: leadership.js
   ========================================================= */

import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  get,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* =========================================================
   1. FIREBASE CONNECTION
   Reuses the existing Kulzzy Community Firebase app
   ========================================================= */

const app = getApp();
const db = getDatabase(app);
const auth = getAuth(app);


/* =========================================================
   2. ADMIN CONFIGURATION
   ========================================================= */

const ADMIN_UID = "J5bniEYbkIaDLmn4RPBbAC7crf23";

const PATHS = {
  profiles: "profiles",
  entries: "leadershipDailyEntries",
  votes: "leadershipDailyVotes",
  settings: "leadershipDailySettings",
  results: "leadershipDailyResults"
};


/* =========================================================
   3. APPLICATION STATE
   ========================================================= */

let currentUser = null;
let currentDate = getNigeriaDate();

let contestants = {};
let publishedResults = null;
let myVote = null;
let votingClosed = false;

let listenersStarted = false;
let voteListenerStarted = false;


/* =========================================================
   4. HTML ELEMENT HELPER
   ========================================================= */

function element(id) {
  return document.getElementById(id);
}

function showMessage(id, message) {
  const el = element(id);

  if (el) {
    el.textContent = message;
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}


/* =========================================================
   5. NIGERIA DATE
   ========================================================= */

function getNigeriaDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = {};

  parts.forEach(part => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
}


/* =========================================================
   6. DATABASE PATHS
   ========================================================= */

function dailyPath(path) {
  return `${path}/${currentDate}`;
}


/* =========================================================
   7. STATUS DISPLAY
   ========================================================= */

function updateDateStatus() {
  const date = currentDate.split("-").reverse().join("/");

  showMessage(
    "klcDateStatus",
    `Nigeria date: ${date} | ${votingClosed ? "Voting closed" : "Voting open"}`
  );
}


/* =========================================================
   8. LOAD THE EXISTING COMMUNITY PROFILE
   ========================================================= */

async function getMyProfile() {
  if (!currentUser) {
    throw new Error("Please sign in to your community account.");
  }

  const snapshot = await get(
    ref(db, `${PATHS.profiles}/${currentUser.uid}`)
  );

  if (!snapshot.exists()) {
    throw new Error("Your community profile could not be found.");
  }

  const profile = snapshot.val();

  if (!profile.name || typeof profile.name !== "string") {
    throw new Error("Your community profile has no valid name.");
  }

  const username = typeof profile.username === "string"
    ? profile.username
    : "";

  const photo = typeof profile.photo === "string"
    ? profile.photo
    : "";

  return {
    uid: currentUser.uid,
    name: profile.name,
    username,
    photo,
    searchName: profile.name.trim().toLowerCase(),
    searchUsername: (username || profile.name)
      .trim()
      .toLowerCase()
  };
}


/* =========================================================
   9. REGISTER AS A CONTESTANT
   ========================================================= */

async function joinChallenge() {
  if (!currentUser) {
    showMessage(
      "klcMyStatus",
      "Please sign in to your community account first."
    );
    return;
  }

  if (votingClosed) {
    showMessage(
      "klcMyStatus",
      "Today's leadership voting has closed."
    );
    return;
  }

  const button = element("klcJoinBtn");

  if (button) {
    button.disabled = true;
    button.textContent = "REGISTERING...";
  }

  try {
    const profile = await getMyProfile();

    const entryRef = ref(
      db,
      `${PATHS.entries}/${currentDate}/${currentUser.uid}`
    );

    const existing = await get(entryRef);

    if (existing.exists()) {
      showMessage(
        "klcMyStatus",
        "You are already registered as a contestant today."
      );
      return;
    }

    await set(entryRef, {
      uid: profile.uid,
      name: profile.name,
      username: profile.username,
      photo: profile.photo,
      searchName: profile.searchName,
      searchUsername: profile.searchUsername,
      joinedAt: Date.now()
    });

    showMessage(
      "klcMyStatus",
      "Congratulations! You have successfully entered today's leadership challenge."
    );

  } catch (error) {
    console.error("Leadership registration error:", error);

    showMessage(
      "klcMyStatus",
      `Registration failed: ${error.message}`
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "CONTEST FOR LEADERSHIP";
    }
  }
}


/* =========================================================
   10. LOAD CONTESTANTS
   ========================================================= */

function startEntryListener() {
  onValue(
    ref(db, dailyPath(PATHS.entries)),
    snapshot => {
      contestants = snapshot.val() || {};

      renderContestants();
      renderMyStatus();
    },
    error => {
      console.error("Contestant loading error:", error);

      showMessage(
        "klcContestants",
        `Unable to load contestants: ${error.message}`
      );
    }
  );
}


/* =========================================================
   11. CHECK WHETHER VOTING IS CLOSED
   ========================================================= */

function startSettingsListener() {
  onValue(
    ref(db, `${dailyPath(PATHS.settings)}/closed`),
    snapshot => {
      votingClosed = snapshot.val() === true;

      updateDateStatus();
      renderContestants();
      renderMyStatus();
    },
    error => {
      console.error("Voting settings error:", error);

      showMessage(
        "klcDateStatus",
        `Unable to load voting status: ${error.message}`
      );
    }
  );
}


/* =========================================================
   12. CHECK MY VOTE
   ========================================================= */

function startMyVoteListener() {
  if (!currentUser || voteListenerStarted) {
    return;
  }

  voteListenerStarted = true;

  onValue(
    ref(
      db,
      `${PATHS.votes}/${currentDate}/${currentUser.uid}`
    ),
    snapshot => {
      myVote = snapshot.val() || null;

      renderContestants();
      renderMyStatus();
    },
    error => {
      console.error("Vote status error:", error);

      showMessage(
        "klcMyStatus",
        `Unable to check your vote: ${error.message}`
      );
    }
  );
}


/* =========================================================
   13. RENDER MY STATUS
   ========================================================= */

function renderMyStatus() {
  if (!currentUser) {
    showMessage(
      "klcMyStatus",
      "Sign in to enter the leadership challenge and vote."
    );
    return;
  }

  const myEntry = contestants[currentUser.uid];

  if (myEntry) {
    showMessage(
      "klcMyStatus",
      "You are registered as a contestant today."
    );
  } else if (votingClosed) {
    showMessage(
      "klcMyStatus",
      "Today's leadership challenge is closed."
    );
  } else {
    showMessage(
      "klcMyStatus",
      "You have not entered today's leadership challenge."
    );
  }

  const button = element("klcJoinBtn");

  if (button) {
    button.disabled = Boolean(myEntry) || votingClosed;

    button.textContent = myEntry
      ? "YOU ARE REGISTERED"
      : votingClosed
        ? "VOTING CLOSED"
        : "CONTEST FOR LEADERSHIP";
  }
}


/* =========================================================
   14. CONTESTANT SEARCH
   ========================================================= */

function getFilteredContestants() {
  const search = (element("klcSearch")?.value || "")
    .trim()
    .toLowerCase();

  return Object.values(contestants).filter(person => {
    const name = String(person.name || "").toLowerCase();
    const username = String(person.username || "").toLowerCase();

    return !search ||
      name.startsWith(search) ||
      username.startsWith(search);
  });
}


/* =========================================================
   15. DISPLAY CONTESTANTS
   ========================================================= */

function renderContestants() {
  const container = element("klcContestants");

  if (!container) return;

  const people = getFilteredContestants();

  if (!people.length) {
    container.textContent = Object.keys(contestants).length
      ? "No contestant matches your search."
      : "No contestants have registered today.";

    return;
  }

  people.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );

  container.innerHTML = people.map(person => {
    const uid = escapeHTML(person.uid);
    const name = escapeHTML(person.name);
    const username = escapeHTML(person.username || "");
    const photo = escapeHTML(person.photo || "");

    const isMe = currentUser && person.uid === currentUser.uid;

    const buttonDisabled =
      !currentUser ||
      isMe ||
      Boolean(myVote) ||
      votingClosed;

    let buttonText = "VOTE";

    if (isMe) buttonText = "YOUR PROFILE";
    else if (myVote) buttonText = "VOTE USED";
    else if (votingClosed) buttonText = "CLOSED";

    const avatar = photo
      ? `<img src="${photo}" alt="${name}" style="width:65px;height:65px;border-radius:50%;object-fit:cover;">`
      : `<div style="width:65px;height:65px;border-radius:50%;background:#172a4a;display:flex;align-items:center;justify-content:center;font-size:25px;">👤</div>`;

    return `
      <div style="
        display:flex;
        align-items:center;
        gap:12px;
        background:#0b1b38;
        border:1px solid #314365;
        border-radius:12px;
        padding:12px;
        margin:10px 0;
        color:white;
      ">
        ${avatar}

        <div style="flex:1;min-width:0;">
          <div style="font-weight:bold;">
            ${name}
          </div>

          <div style="font-size:12px;color:#c4cce0;">
            ${username ? "@" + username : "Community contestant"}
          </div>
        </div>

        <button
          type="button"
          data-vote-uid="${uid}"
          ${buttonDisabled ? "disabled" : ""}
          style="
            background:${buttonDisabled ? "#555" : "#ffd700"};
            color:${buttonDisabled ? "white" : "#06122a"};
            border:0;
            border-radius:8px;
            padding:10px 13px;
            font-weight:bold;
          "
        >
          ${buttonText}
        </button>
      </div>
    `;
  }).join("");
}


/* =========================================================
   16. CAST A VOTE
   One vote per registered account per day
   No self-voting
   ========================================================= */

async function castVote(candidateUid) {
  if (!currentUser) {
    alert("Please sign in before voting.");
    return;
  }

  if (votingClosed) {
    alert("Voting has closed.");
    return;
  }

  if (candidateUid === currentUser.uid) {
    alert("You cannot vote for yourself.");
    return;
  }

  if (!contestants[candidateUid]) {
    alert("This contestant is not registered today.");
    return;
  }

  if (myVote) {
    alert("You have already used your vote today.");
    return;
  }

  try {
    const voteRef = ref(
      db,
      `${PATHS.votes}/${currentDate}/${currentUser.uid}`
    );

    const existingVote = await get(voteRef);

    if (existingVote.exists()) {
      alert("You have already voted today.");
      return;
    }

    await set(voteRef, {
      candidateUid,
      createdAt: Date.now()
    });

    alert("Your vote has been submitted successfully.");

  } catch (error) {
    console.error("Voting error:", error);

    alert(`Your vote could not be submitted: ${error.message}`);
  }
}


/* =========================================================
   17. LOAD PUBLISHED RESULTS
   ========================================================= */

function startResultsListener() {
  onValue(
    ref(db, dailyPath(PATHS.results)),
    snapshot => {
      publishedResults = snapshot.val() || null;

      renderResults();
      renderTopThree();
    },
    error => {
      console.error("Results loading error:", error);

      showMessage(
        "klcResults",
        `Unable to load published results: ${error.message}`
      );
    }
  );
}


/* =========================================================
   18. RANKING TITLES
   ========================================================= */

function getLeadershipTitle(rank) {
  if (rank === 1) return "🥇 Universal President of the Day";
  if (rank === 2) return "🥈 Universal Vice President of the Day";
  if (rank === 3) return "🥉 Universal Senate President of the Day";

  if (rank >= 4 && rank <= 103) {
    return `LGC No. ${rank - 3}`;
  }

  return "Community Member";
}


/* =========================================================
   19. DISPLAY TOP THREE
   ========================================================= */

function renderTopThree() {
  const container = element("klcTopThree");

  if (!container) return;

  if (!publishedResults || !publishedResults.rankings) {
    container.textContent =
      "Official leaders will appear here after results are published.";

    return;
  }

  const top = Object.values(publishedResults.rankings)
    .filter(person => person.rank <= 3)
    .sort((a, b) => a.rank - b.rank);

  if (!top.length) {
    container.textContent = "No official leaders have been published.";
    return;
  }

  container.innerHTML = `
    <div style="
      display:flex;
      gap:12px;
      overflow-x:auto;
      padding:8px 0;
    ">
      ${top.map(person => `
        <div style="
          min-width:220px;
          background:#0b1b38;
          border:1px solid #ffd700;
          border-radius:14px;
          padding:15px;
          color:white;
          text-align:center;
        ">
          <div style="font-size:28px;">
            ${person.rank === 1 ? "🥇" : person.rank === 2 ? "🥈" : "🥉"}
          </div>

          <div style="font-weight:bold;">
            ${escapeHTML(person.name)}
          </div>

          <div style="color:#ffd700;font-size:13px;margin-top:6px;">
            ${escapeHTML(getLeadershipTitle(person.rank))}
          </div>

          <div style="margin-top:8px;font-size:12px;">
            ${Number(person.votes || 0)} votes
          </div>
        </div>
      `).join("")}
    </div>
  `;
}


/* =========================================================
   20. DISPLAY OFFICIAL RESULTS
   ========================================================= */

function renderResults() {
  const container = element("klcResults");

  if (!container) return;

  if (!publishedResults || !publishedResults.rankings) {
    container.textContent =
      "Today's official results have not been published.";

    return;
  }

  const rankings = Object.values(publishedResults.rankings)
    .sort((a, b) => a.rank - b.rank);

  container.innerHTML = `
    <div style="color:#ffd700;font-weight:bold;margin-bottom:12px;">
      OFFICIAL LEADERSHIP RESULTS
    </div>

    ${rankings.map(person => `
      <div style="
        background:#0b1b38;
        border:1px solid #314365;
        border-radius:9px;
        padding:11px;
        margin:7px 0;
        color:white;
      ">
        <strong>#${person.rank}</strong>
        &nbsp; ${escapeHTML(person.name)}

        <div style="font-size:12px;color:#ffd700;margin-top:4px;">
          ${escapeHTML(getLeadershipTitle(person.rank))}
        </div>

        <div style="font-size:12px;color:#c4cce0;">
          ${Number(person.votes || 0)} votes
        </div>
      </div>
    `).join("")}
  `;
}


/* =========================================================
   21. ADMIN ACCESS
   ========================================================= */

function configureAdmin() {
  const panel = element("klcAdminPanel");

  if (panel) {
    panel.style.display =
      currentUser && currentUser.uid === ADMIN_UID
        ? "block"
        : "none";
  }
}


/* =========================================================
   22. ADMIN: CALCULATE VOTES AND RANKINGS
   ========================================================= */

async function calculateRankings() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    throw new Error("Administrator access required.");
  }

  const [entriesSnapshot, votesSnapshot] = await Promise.all([
    get(ref(db, dailyPath(PATHS.entries))),
    get(ref(db, dailyPath(PATHS.votes)))
  ]);

  const entries = entriesSnapshot.val() || {};
  const votes = votesSnapshot.val() || {};

  const totals = {};

  Object.keys(entries).forEach(uid => {
    totals[uid] = 0;
  });

  Object.values(votes).forEach(vote => {
    if (
      vote &&
      vote.candidateUid &&
      Object.prototype.hasOwnProperty.call(totals, vote.candidateUid)
    ) {
      totals[vote.candidateUid]++;
    }
  });

  const rankings = Object.entries(entries)
    .map(([uid, person]) => ({
      uid,
      name: person.name || "",
      username: person.username || "",
      photo: person.photo || "",
      votes: totals[uid] || 0
    }))
    .sort((a, b) =>
      b.votes - a.votes ||
      a.name.localeCompare(b.name)
    )
    .map((person, index) => ({
      ...person,
      rank: index + 1,
      title: getLeadershipTitle(index + 1)
    }));

  return {
    date: currentDate,
    closed: votingClosed,
    updatedAt: Date.now(),
    totalContestants: rankings.length,
    rankings
  };
}


/* =========================================================
   23. ADMIN: PREVIEW RANKINGS
   ========================================================= */

async function previewAdminRankings() {
  const preview = element("klcAdminPreview");

  if (preview) {
    preview.textContent = "Calculating rankings...";
  }

  try {
    const result = await calculateRankings();

    if (preview) {
      preview.innerHTML = result.rankings.map(person => `
        <div style="padding:7px;border-bottom:1px solid #314365;">
          #${person.rank} — ${escapeHTML(person.name)}
          — ${person.votes} votes
          <div style="color:#ffd700;font-size:12px;">
            ${escapeHTML(person.title)}
          </div>
        </div>
      `).join("") || "No contestants yet.";
    }

  } catch (error) {
    console.error(error);

    if (preview) {
      preview.textContent = error.message;
    }
  }
}


/* =========================================================
   24. ADMIN: PUBLISH RESULTS
   ========================================================= */

async function publishResults() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    alert("Administrator access required.");
    return;
  }

  if (!confirm("Publish today's official leadership results?")) {
    return;
  }

  try {
    const result = await calculateRankings();

    await set(
      ref(db, dailyPath(PATHS.results)),
      result
    );

    alert("Official leadership results published successfully.");

  } catch (error) {
    console.error("Publish results error:", error);

    alert(`Could not publish results: ${error.message}`);
  }
}


/* =========================================================
   25. ADMIN: CLOSE VOTING PERMANENTLY
   ========================================================= */

async function closeVoting() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    alert("Administrator access required.");
    return;
  }

  if (votingClosed) {
    alert("Voting is already closed.");
    return;
  }

  if (!confirm(
    "Close today's voting permanently and publish the final results?"
  )) {
    return;
  }

  try {
    await set(
      ref(db, `${dailyPath(PATHS.settings)}/closed`),
      true
    );

    votingClosed = true;

    const result = await calculateRankings();

    result.closed = true;

    await set(
      ref(db, dailyPath(PATHS.results)),
      result
    );

    alert("Voting closed permanently. Final results published.");

  } catch (error) {
    console.error("Close voting error:", error);

    alert(`Could not complete the closing process: ${error.message}`);
  }
}


/* =========================================================
   26. ADMIN: REFRESH RANKINGS
   ========================================================= */

async function refreshAdminVotes() {
  await previewAdminRankings();
}


/* =========================================================
   27. BUTTON EVENTS
   ========================================================= */

element("klcJoinBtn")?.addEventListener("click", joinChallenge);

element("klcSearch")?.addEventListener("input", renderContestants);

element("klcContestants")?.addEventListener("click", event => {
  const button = event.target.closest("[data-vote-uid]");

  if (!button) return;

  const uid = button.getAttribute("data-vote-uid");

  if (uid) {
    castVote(uid);
  }
});

element("klcRefreshVotes")?.addEventListener(
  "click",
  refreshAdminVotes
);

element("klcPublishResults")?.addEventListener(
  "click",
  publishResults
);

element("klcCloseVoting")?.addEventListener(
  "click",
  closeVoting
);


/* =========================================================
   28. AUTHENTICATION STARTUP
   IMPORTANT: DATABASE LISTENERS START ONLY AFTER LOGIN
   ========================================================= */

onAuthStateChanged(auth, user => {
  currentUser = user || null;

  configureAdmin();

  if (user) {
    if (!listenersStarted) {
      listenersStarted = true;

      startEntryListener();
      startSettingsListener();
      startResultsListener();
    }

    if (!voteListenerStarted) {
      startMyVoteListener();
    }

    showMessage(
      "klcDateStatus",
      "Your community account is connected. Loading the leadership challenge..."
    );

  } else {
    showMessage(
      "klcDateStatus",
      "Please sign in to your community account to access the challenge."
    );

    showMessage(
      "klcContestants",
      "Sign in to load today's contestants."
    );

    showMessage(
      "klcMyStatus",
      "Sign in to enter and vote."
    );
  }

  renderMyStatus();
});


/* =========================================================
   29. INITIAL DISPLAY
   ========================================================= */

updateDateStatus();

showMessage(
  "klcContestants",
  "Waiting for your community account to connect..."
);

showMessage(
  "klcResults",
  "Loading official results..."
);

showMessage(
  "klcTopThree",
  "Loading today's official leaders..."
);
