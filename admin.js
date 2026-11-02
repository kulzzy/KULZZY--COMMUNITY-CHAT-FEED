
/* =====================================================
   KULZZY UNIVERSAL LEADERSHIP CHALLENGE
   PRIVATE ADMINISTRATION SYSTEM
   File: admin.js
   ===================================================== */

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

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


/* =====================================================
   1. FIREBASE CONFIGURATION
   ===================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyBH85NGWsSAK5cubbPdnmunwYZFZpj_CB0",
  authDomain: "kulzzy-radio-chat.firebaseapp.com",
  databaseURL: "https://kulzzy-radio-chat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "kulzzy-radio-chat",
  storageBucket: "kulzzy-radio-chat.firebasestorage.app",
  messagingSenderId: "510100635134",
  appId: "1:510100635134:web:9d3b2e983eb6e9a385d4af"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);


/* =====================================================
   2. AUTHORISED ADMIN
   ===================================================== */

const ADMIN_UID = "J5bniEYbkIaDLmn4RPBbAC7crf23";

let currentUser = null;
let votingClosed = false;
let latestRankings = [];


/* =====================================================
   3. NIGERIA DATE
   ===================================================== */

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

const today = getNigeriaDate();

document.getElementById("adminDate").textContent =
  "Nigeria date: " + today;


/* =====================================================
   4. HELPERS
   ===================================================== */

function el(id) {
  return document.getElementById(id);
}

function message(id, value) {
  el(id).textContent = value;
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

function requireAdmin() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    throw new Error("You are not authorised to perform this action.");
  }
}


/* =====================================================
   5. CHECK VOTING STATUS
   ===================================================== */

function listenToVotingStatus() {
  onValue(
    ref(db, `leadershipDailySettings/${today}/closed`),
    snapshot => {
      votingClosed = snapshot.val() === true;

      message(
        "votingStatus",
        votingClosed
          ? "🔴 VOTING IS PERMANENTLY CLOSED"
          : "🟢 VOTING IS OPEN"
      );
    },
    error => {
      message("votingStatus", "Unable to check status: " + error.message);
    }
  );
}


/* =====================================================
   6. CALCULATE OFFICIAL RANKINGS
   ===================================================== */

async function calculateRankings() {
  requireAdmin();

  const [entriesSnapshot, votesSnapshot] = await Promise.all([
    get(ref(db, `leadershipDailyEntries/${today}`)),
    get(ref(db, `leadershipDailyVotes/${today}`))
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
      title:
        index === 0
          ? "Universal President of the Day"
          : index === 1
            ? "Universal Vice President of the Day"
            : index === 2
              ? "Universal Senate President of the Day"
              : index < 103
                ? `LGC No. ${index - 2}`
                : "Community Member"
    }));

  latestRankings = rankings;

  return {
    date: today,
    closed: votingClosed,
    updatedAt: Date.now(),
    totalContestants: rankings.length,
    rankings
  };
}


/* =====================================================
   7. DISPLAY AGGREGATED VOTE TOTALS
   Individual voter identities are never displayed.
   ===================================================== */

function displayRankings(rankings) {
  const container = el("adminResults");

  if (!rankings.length) {
    container.textContent = "No contestants yet.";
    return;
  }

  container.innerHTML = rankings.map(person => `
    <div class="result">
      <strong>
        #${person.rank} — ${escapeHTML(person.name)}
      </strong>

      <div class="small">
        ${escapeHTML(person.title)}
      </div>

      <div class="status">
        ${Number(person.votes)} votes
      </div>
    </div>
  `).join("");
}


/* =====================================================
   8. VIEW PRIVATE VOTE TOTALS
   ===================================================== */

async function viewVotes() {
  try {
    requireAdmin();

    message("adminMessage", "Loading vote totals...");

    const result = await calculateRankings();

    displayRankings(result.rankings);

    message(
      "adminMessage",
      `Vote totals loaded successfully.\nContestants: ${result.totalContestants}\nDate: ${today}`
    );

  } catch (error) {
    console.error(error);
    message("adminMessage", error.message);
  }
}


/* =====================================================
   9. PUBLISH OFFICIAL RESULTS
   ===================================================== */

async function publishResults() {
  try {
    requireAdmin();

    if (votingClosed) {
      throw new Error(
        "Voting is closed. The final results are already controlled by the closing process."
      );
    }

    if (!confirm("Publish today's official leadership results?")) {
      return;
    }

    message("adminMessage", "Publishing official results...");

    const result = await calculateRankings();

    await set(
      ref(db, `leadershipDailyResults/${today}`),
      result
    );

    displayRankings(result.rankings);

    message(
      "adminMessage",
      "Official results published successfully."
    );

  } catch (error) {
    console.error(error);
    message("adminMessage", "Publishing failed: " + error.message);
  }
}


/* =====================================================
   10. CLOSE VOTING AND PUBLISH FINAL RESULTS
   ===================================================== */

async function closeVoting() {
  try {
    requireAdmin();

    if (votingClosed) {
      throw new Error("Voting is already closed.");
    }

    if (!confirm(
      "WARNING: This will permanently close today's voting and publish the final results. Continue?"
    )) {
      return;
    }

    message("adminMessage", "Closing voting...");

    await set(
      ref(db, `leadershipDailySettings/${today}/closed`),
      true
    );

    votingClosed = true;

    const result = await calculateRankings();

    result.closed = true;

    await set(
      ref(db, `leadershipDailyResults/${today}`),
      result
    );

    displayRankings(result.rankings);

    message(
      "adminMessage",
      "Voting has been closed and the final results have been published."
    );

  } catch (error) {
    console.error(error);
    message("adminMessage", "Closing failed: " + error.message);
  }
}


/* =====================================================
   11. BUTTON EVENTS
   ===================================================== */

el("viewVotes").addEventListener("click", viewVotes);
el("publishResults").addEventListener("click", publishResults);
el("closeVoting").addEventListener("click", closeVoting);


/* =====================================================
   12. ADMIN AUTHENTICATION
   ===================================================== */

onAuthStateChanged(auth, user => {
  currentUser = user || null;

  const controls = el("adminControls");

  if (!user) {
    controls.style.display = "none";

    message(
      "adminStatus",
      "No community account is signed in. Sign in to your Kulzzy community account first, then open this admin page."
    );

    message(
      "adminMessage",
      "Administrator authentication is required."
    );

    return;
  }

  if (user.uid !== ADMIN_UID) {
    controls.style.display = "none";

    message(
      "adminStatus",
      "ACCESS DENIED. This account is not authorised."
    );

    message(
      "adminMessage",
      "Only the authorised administrator can manage this challenge."
    );

    return;
  }

  controls.style.display = "block";

  message(
    "adminStatus",
    "Administrator access verified."
  );

  message(
    "adminMessage",
    "Welcome. Your administration tools are ready."
  );

  listenToVotingStatus();
});
