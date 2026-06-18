package rename

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode"
)

type Mode string

const (
	ModeApply  Mode = "apply"
	ModeDryRun Mode = "dry-run"
	ModeOff    Mode = "off"
)

type Config struct {
	Enabled                  bool      `json:"enabled"`
	Mode                     Mode      `json:"mode"`
	RespectManualTitles      bool      `json:"respectManualTitles"`
	MinSecondsBetweenRenames int       `json:"minSecondsBetweenRenames"`
	MinTurnsBetweenRenames   int       `json:"minTurnsBetweenRenames"`
	MaxTitleLength           int       `json:"maxTitleLength"`
	LogPrompts               bool      `json:"logPrompts"`
	CodexPath                string    `json:"codexPath"`
	AppServerTimeoutMs       int       `json:"appServerTimeoutMs"`
	StateDir                 string    `json:"stateDir"`
	LogPath                  string    `json:"logPath"`
	LLM                      LLMConfig `json:"llm"`
}

type LLMConfig struct {
	Enabled   bool   `json:"enabled"`
	Model     string `json:"model"`
	TimeoutMs int    `json:"timeoutMs"`
}

type IntentSummary struct {
	TicketIDs       []string `json:"ticketIds"`
	Paths           []string `json:"paths"`
	RepoWords       []string `json:"repoWords"`
	ActionType      string   `json:"actionType"`
	DeliverableType string   `json:"deliverableType"`
	Keywords        []string `json:"keywords"`
	UserGoal        string   `json:"userGoal"`
}

type PendingPrompt struct {
	TurnID        string        `json:"turnId"`
	PromptHash    string        `json:"promptHash"`
	PromptPreview string        `json:"promptPreview"`
	Intent        IntentSummary `json:"intent"`
	CreatedAt     string        `json:"createdAt"`
}

type ThreadState struct {
	ThreadID              string         `json:"threadId"`
	StableIntent          *IntentSummary `json:"stableIntent"`
	LastAutoTitle         *string        `json:"lastAutoTitle"`
	LastRenameAt          *time.Time     `json:"lastRenameAt"`
	LastRenameTurnOrdinal int            `json:"lastRenameTurnOrdinal"`
	TurnOrdinal           int            `json:"turnOrdinal"`
	RecentTitles          []string       `json:"recentTitles"`
	ManualLock            bool           `json:"manualLock"`
	PendingPrompt         *PendingPrompt `json:"pendingPrompt"`
	LastProcessedTurnIDs  []string       `json:"lastProcessedTurnIds"`
	UpdatedAt             time.Time      `json:"updatedAt"`
}

type ThreadRecord struct {
	ID   string  `json:"id"`
	Name *string `json:"name"`
	CWD  string  `json:"cwd"`
}

type TranscriptTail struct {
	UserMessages      []string `json:"userMessages"`
	AssistantMessages []string `json:"assistantMessages"`
	ToolSignals       []string `json:"toolSignals"`
}

type RenameDecision struct {
	Kind       string   `json:"kind"`
	ThreadID   string   `json:"threadId"`
	OldTitle   *string  `json:"oldTitle"`
	NewTitle   *string  `json:"newTitle"`
	Confidence float64  `json:"confidence"`
	Reason     string   `json:"reason"`
	Signals    []string `json:"signals"`
	SourceHash string   `json:"sourceHash"`
}

var genericTitles = map[string]struct{}{
	"":            {},
	"new chat":    {},
	"new thread":  {},
	"untitled":    {},
	"codex":       {},
	"debug issue": {},
	"help":        {},
	"question":    {},
}

var (
	sameTaskHints = regexp.MustCompile(`(?i)\b(continue|same|that|this|now test|run tests|commit|push|merge|fix that|status|how is it going)\b`)
	changeHints   = regexp.MustCompile(`(?i)\b(new task|switch gears|different question|unrelated|another repo|now research|let's do|lets do)\b`)
	ticketIDRe    = regexp.MustCompile(`\b[A-Z][A-Z0-9]+-\d+\b`)
	pathRe        = regexp.MustCompile(`\b(?:[\w.-]+/)+(?:[\w.[\]-]+)\b`)
	wordCleanRe   = regexp.MustCompile(`[^a-z0-9_\-./:[\]#]+`)
)

var stopwords = map[string]struct{}{
	"the": {}, "and": {}, "for": {}, "with": {}, "that": {}, "this": {}, "you": {},
	"can": {}, "pls": {}, "please": {}, "into": {}, "from": {}, "what": {}, "when": {},
	"where": {}, "how": {}, "why": {}, "just": {}, "now": {}, "then": {}, "about": {},
	"doing": {}, "work": {}, "task": {}, "thread": {}, "session": {}, "codex": {},
}

func DefaultConfig() Config {
	return Config{
		Enabled:                  true,
		Mode:                     ModeApply,
		RespectManualTitles:      true,
		MinSecondsBetweenRenames: 600,
		MinTurnsBetweenRenames:   4,
		MaxTitleLength:           64,
		CodexPath:                "codex",
		AppServerTimeoutMs:       1500,
		LLM: LLMConfig{
			Enabled:   false,
			Model:     "gpt-5.4-mini",
			TimeoutMs: 2000,
		},
	}
}

func InitialThreadState(threadID string) ThreadState {
	return ThreadState{
		ThreadID:              threadID,
		LastRenameTurnOrdinal: 0,
		TurnOrdinal:           0,
		RecentTitles:          []string{},
		LastProcessedTurnIDs:  []string{},
		UpdatedAt:             time.Now().UTC(),
	}
}

func CreatePendingPrompt(turnID, prompt string, cwd *string) PendingPrompt {
	promptPreview := clip(normalizeWhitespace(prompt), 4000)
	intentInput := promptPreview
	if cwd != nil {
		intentInput += " " + *cwd
	}
	return PendingPrompt{
		TurnID:        turnID,
		PromptHash:    sha256Hex(promptPreview),
		PromptPreview: promptPreview,
		Intent:        ExtractIntent(intentInput),
		CreatedAt:     time.Now().UTC().Format(time.RFC3339Nano),
	}
}

type DecideInput struct {
	Config           Config
	State            *ThreadState
	Thread           *ThreadRecord
	Prompt           *PendingPrompt
	AssistantMessage string
	Transcript       TranscriptTail
	SourceHash       string
	Force            bool
}

func DecideRename(input DecideInput) RenameDecision {
	config := input.Config
	state := input.State
	threadID := state.ThreadID
	oldTitle := oldTitle(input.Thread)

	if !config.Enabled || config.Mode == ModeOff {
		return skipped(threadID, oldTitle, input.SourceHash, "disabled", []string{"disabled"})
	}

	turnKey := input.SourceHash
	if input.Prompt != nil {
		turnKey = input.Prompt.TurnID
	}
	if slices.Contains(state.LastProcessedTurnIDs, turnKey) {
		return skipped(threadID, oldTitle, input.SourceHash, "turn already processed", []string{"idempotent"})
	}
	if state.ManualLock && !input.Force {
		return skipped(threadID, oldTitle, input.SourceHash, "manual title lock", []string{"manual_lock"})
	}
	if config.RespectManualTitles && state.LastAutoTitle != nil && oldTitle != nil && *oldTitle != *state.LastAutoTitle {
		state.ManualLock = true
		return skipped(threadID, oldTitle, input.SourceHash, "current title differs from last auto title", []string{"manual_title_detected"})
	}

	promptText := ""
	if input.Prompt != nil {
		promptText = input.Prompt.PromptPreview
	} else if len(input.Transcript.UserMessages) > 0 {
		promptText = input.Transcript.UserMessages[len(input.Transcript.UserMessages)-1]
	}

	outcomeParts := append([]string{input.AssistantMessage}, input.Transcript.AssistantMessages...)
	outcomeParts = append(outcomeParts, input.Transcript.ToolSignals...)
	outcomeText := normalizeWhitespace(strings.Join(outcomeParts, " "))

	intentInput := strings.TrimSpace(promptText + " " + outcomeText)
	if input.Thread != nil && input.Thread.CWD != "" {
		intentInput += " " + input.Thread.CWD
	}
	completedIntent := ExtractIntent(intentInput)
	oldIsGeneric := isGenericTitle(oldTitle)
	if !isMeaningfulTurn(promptText, outcomeText, oldIsGeneric) {
		return skipped(threadID, oldTitle, input.SourceHash, "turn is not meaningful enough", []string{"low_signal"})
	}

	similarity := 0.0
	if state.StableIntent != nil {
		similarity = scoreSimilarity(*state.StableIntent, completedIntent, promptText)
	}
	strongChangeSignals := countStrongChangeSignals(state.StableIntent, completedIntent, promptText, oldTitle)
	cooldown := cooldownAllowsRename(config, *state)
	firstTitle := oldIsGeneric && state.LastAutoTitle == nil
	improvedFirstTitle := oldIsGeneric || titleTooBroad(oldTitle, completedIntent)
	shouldRename := firstTitle ||
		input.Force ||
		(cooldown && similarity < 0.3 && strongChangeSignals >= 2) ||
		(cooldown && similarity < 0.45 && strongChangeSignals >= 1) ||
		(cooldown && improvedFirstTitle && similarity < 0.72)

	if !shouldRename {
		return skipped(threadID, oldTitle, input.SourceHash, "same durable task or cooldown active", []string{
			"similarity:" + formatScore(similarity),
			"strong_change:" + intString(strongChangeSignals),
		})
	}

	generated := generateTitle(completedIntent, promptText, config.MaxTitleLength)
	candidate := generated.title
	confidence := generated.confidence
	checked, reason := validateTitle(candidate, oldTitle, config.MaxTitleLength)
	if checked == nil {
		return skipped(threadID, oldTitle, input.SourceHash, reason, []string{"invalid_title"})
	}
	if confidence < 0.68 && !firstTitle {
		return skipped(threadID, oldTitle, input.SourceHash, "candidate confidence too low", []string{"confidence:" + formatScore(confidence)})
	}

	kind := "renamed"
	if config.Mode == ModeDryRun {
		kind = "would_rename"
	}
	decisionReason := "material direction change"
	if firstTitle {
		decisionReason = "first meaningful title"
	}
	signals := []string{
		"similarity:" + formatScore(similarity),
		"strong_change:" + intString(strongChangeSignals),
	}
	signals = append(signals, generated.signals...)
	return RenameDecision{
		Kind:       kind,
		ThreadID:   threadID,
		OldTitle:   oldTitle,
		NewTitle:   checked,
		Confidence: confidence,
		Reason:     decisionReason,
		Signals:    signals,
		SourceHash: input.SourceHash,
	}
}

func ApplyDecisionToState(state ThreadState, decision RenameDecision) ThreadState {
	turnKey := decision.SourceHash
	processed := make([]string, 0, len(state.LastProcessedTurnIDs)+1)
	for _, id := range state.LastProcessedTurnIDs {
		if id != turnKey {
			processed = append(processed, id)
		}
	}
	processed = append(processed, turnKey)
	if len(processed) > 20 {
		processed = processed[len(processed)-20:]
	}

	next := state
	next.LastProcessedTurnIDs = processed
	next.TurnOrdinal = state.TurnOrdinal + 1
	next.UpdatedAt = time.Now().UTC()
	if (decision.Kind == "renamed" || decision.Kind == "would_rename") && decision.NewTitle != nil {
		title := *decision.NewTitle
		now := time.Now().UTC()
		intent := ExtractIntent(title)
		next.LastAutoTitle = &title
		next.LastRenameAt = &now
		next.LastRenameTurnOrdinal = next.TurnOrdinal
		next.RecentTitles = append(append([]string{}, state.RecentTitles...), title)
		if len(next.RecentTitles) > 8 {
			next.RecentTitles = next.RecentTitles[len(next.RecentTitles)-8:]
		}
		next.StableIntent = &intent
		next.PendingPrompt = nil
	}
	return next
}

func ExtractIntent(input string) IntentSummary {
	normalized := normalizeWhitespace(input)
	ticketIDs := unique(ticketIDRe.FindAllString(normalized, -1))
	paths := pathRe.FindAllString(normalized, -1)
	if len(paths) > 8 {
		paths = paths[:8]
	}
	paths = unique(paths)
	keywords := unique(words(normalized))
	if len(keywords) > 20 {
		keywords = keywords[:20]
	}
	repoWords := make([]string, 0)
	for _, word := range keywords {
		if strings.Contains(word, "repo") || strings.Contains(word, "mobile") || strings.Contains(word, "web") ||
			strings.Contains(word, "api") || strings.Contains(word, "codex") || strings.Contains(word, "hook") ||
			strings.Contains(word, "thread") || strings.Contains(word, "title") {
			repoWords = append(repoWords, word)
		}
	}
	return IntentSummary{
		TicketIDs:       ticketIDs,
		Paths:           paths,
		RepoWords:       repoWords,
		ActionType:      classifyAction(normalized),
		DeliverableType: classifyDeliverable(normalized),
		Keywords:        keywords,
		UserGoal:        clip(normalized, 500),
	}
}

type generatedTitle struct {
	title      string
	confidence float64
	signals    []string
}

func generateTitle(intent IntentSummary, promptText string, maxLength int) generatedTitle {
	signals := []string{}
	pieces := []string{}
	if len(intent.TicketIDs) > 0 {
		pieces = append(pieces, intent.TicketIDs[0])
		signals = append(signals, "ticket")
	}
	if domain := pickDomain(intent, promptText); len(domain) > 0 {
		pieces = append(pieces, domain...)
		signals = append(signals, "domain")
	}
	if outcome := pickOutcome(intent); len(outcome) > 0 {
		pieces = append(pieces, outcome...)
		signals = append(signals, "outcome")
	}
	if len(pieces) < 3 {
		needed := 6 - len(pieces)
		if needed > len(intent.Keywords) {
			needed = len(intent.Keywords)
		}
		pieces = append(pieces, intent.Keywords[:needed]...)
	}
	uniquePieces := dedupeWords(pieces)
	if len(uniquePieces) > 8 {
		uniquePieces = uniquePieces[:8]
	}
	confidence := minFloat(0.92, 0.45+float64(len(signals))*0.15+minFloat(0.17, float64(len(uniquePieces))*0.03))
	return generatedTitle{
		title:      clip(titleCase(strings.Join(uniquePieces, " ")), maxLength),
		confidence: confidence,
		signals:    signals,
	}
}

func pickDomain(intent IntentSummary, promptText string) []string {
	source := strings.ToLower(promptText + " " + intent.UserGoal)
	if strings.Contains(source, "auto") && strings.Contains(source, "rename") {
		return []string{"Codex", "Auto", "Rename"}
	}
	if strings.Contains(source, "thread") && strings.Contains(source, "title") {
		return []string{"Thread", "Title"}
	}
	if strings.Contains(source, "mobile") {
		return []string{"Mobile"}
	}
	if strings.Contains(source, "revenuecat") {
		return []string{"RevenueCat"}
	}
	if strings.Contains(source, "jira") {
		return []string{"Jira"}
	}
	if len(intent.Paths) > 0 {
		parts := strings.Split(intent.Paths[0], "/")
		filtered := make([]string, 0, len(parts))
		for _, part := range parts {
			if part != "" {
				filtered = append(filtered, part)
			}
		}
		if len(filtered) > 2 {
			filtered = filtered[len(filtered)-2:]
		}
		return filtered
	}
	if len(intent.RepoWords) > 2 {
		return intent.RepoWords[:2]
	}
	return intent.RepoWords
}

func pickOutcome(intent IntentSummary) []string {
	switch intent.DeliverableType {
	case "plugin":
		return []string{"Hook", "Package"}
	case "research":
		return []string{"Research", "Plan"}
	case "implementation":
		return []string{"Implementation"}
	case "debugging":
		return []string{"Diagnostics"}
	case "deployment":
		return []string{"Deployment"}
	}
	if intent.ActionType != "unknown" {
		return []string{intent.ActionType}
	}
	return nil
}

func scoreSimilarity(a, b IntentSummary, promptText string) float64 {
	score := 0.0
	if intersects(a.TicketIDs, b.TicketIDs) {
		score += 0.25
	}
	if intersects(a.RepoWords, b.RepoWords) {
		score += 0.2
	}
	if intersects(a.Paths, b.Paths) {
		score += 0.15
	}
	if a.DeliverableType == b.DeliverableType {
		score += 0.15
	}
	if a.ActionType == b.ActionType {
		score += 0.1
	}
	score += minFloat(0.1, jaccard(a.Keywords, b.Keywords)*0.1)
	if sameTaskHints.MatchString(promptText) {
		score += 0.05
	}
	return minFloat(1, score)
}

func countStrongChangeSignals(stable *IntentSummary, next IntentSummary, promptText string, oldTitle *string) int {
	if stable == nil {
		return 2
	}
	count := 0
	if changeHints.MatchString(promptText) {
		count++
	}
	if len(stable.TicketIDs) > 0 && len(next.TicketIDs) > 0 && !intersects(stable.TicketIDs, next.TicketIDs) {
		count++
	}
	if stable.DeliverableType != next.DeliverableType && next.DeliverableType != "unknown" {
		count++
	}
	if oldTitle != nil && jaccard(words(*oldTitle), next.Keywords) < 0.15 {
		count++
	}
	return count
}

func isMeaningfulTurn(promptText, outcomeText string, oldIsGeneric bool) bool {
	combined := promptText + " " + outcomeText
	if oldIsGeneric && len(words(promptText)) >= 3 {
		return true
	}
	if regexp.MustCompile(`(?i)\b(implement|fix|research|plan|review|deploy|diagnose|test|merge|install|hook|plugin)\b`).MatchString(combined) {
		return true
	}
	return len(words(combined)) >= 18
}

func classifyAction(input string) string {
	switch {
	case regexp.MustCompile(`(?i)\b(research|investigate|look up|find)\b`).MatchString(input):
		return "research"
	case regexp.MustCompile(`(?i)\b(plan|design|architect)\b`).MatchString(input):
		return "design"
	case regexp.MustCompile(`(?i)\b(implement|build|add|create|install|wire)\b`).MatchString(input):
		return "build"
	case regexp.MustCompile(`(?i)\b(debug|diagnose|fix|repair)\b`).MatchString(input):
		return "fix"
	case regexp.MustCompile(`(?i)\b(review|audit)\b`).MatchString(input):
		return "review"
	case regexp.MustCompile(`(?i)\b(deploy|release|rollout)\b`).MatchString(input):
		return "deploy"
	default:
		return "unknown"
	}
}

func classifyDeliverable(input string) string {
	switch {
	case regexp.MustCompile(`(?i)\b(plugin|hook|redistributable|package)\b`).MatchString(input):
		return "plugin"
	case regexp.MustCompile(`(?i)\b(research|plan|proposal)\b`).MatchString(input):
		return "research"
	case regexp.MustCompile(`(?i)\b(implement|build|code|script|typescript|bun)\b`).MatchString(input):
		return "implementation"
	case regexp.MustCompile(`(?i)\b(debug|diagnose|error|failure)\b`).MatchString(input):
		return "debugging"
	case regexp.MustCompile(`(?i)\b(deploy|release)\b`).MatchString(input):
		return "deployment"
	default:
		return "unknown"
	}
}

func validateTitle(title string, oldTitle *string, maxLength int) (*string, string) {
	normalized := normalizeWhitespace(title)
	if normalized == "" {
		return nil, "empty title"
	}
	if hasControlCharacters(normalized) {
		return nil, "title contains control characters"
	}
	if len(normalized) > maxLength {
		clipped := clip(normalized, maxLength)
		return &clipped, ""
	}
	if oldTitle != nil && strings.ToLower(normalized) == strings.ToLower(*oldTitle) {
		return nil, "candidate equals current title"
	}
	if _, ok := genericTitles[strings.ToLower(normalized)]; ok {
		return nil, "candidate is generic"
	}
	return &normalized, ""
}

func isGenericTitle(title *string) bool {
	if title == nil {
		return true
	}
	normalized := strings.ToLower(normalizeWhitespace(*title))
	_, generic := genericTitles[normalized]
	return generic || len(words(normalized)) < 3
}

func titleTooBroad(title *string, intent IntentSummary) bool {
	if title == nil {
		return true
	}
	return jaccard(words(*title), intent.Keywords) < 0.2
}

func cooldownAllowsRename(config Config, state ThreadState) bool {
	if state.LastRenameAt == nil {
		return true
	}
	elapsedSeconds := time.Since(*state.LastRenameAt).Seconds()
	elapsedTurns := state.TurnOrdinal - state.LastRenameTurnOrdinal
	return elapsedSeconds >= float64(config.MinSecondsBetweenRenames) && elapsedTurns >= config.MinTurnsBetweenRenames
}

func skipped(threadID string, oldTitle *string, sourceHash, reason string, signals []string) RenameDecision {
	return RenameDecision{
		Kind:       "skipped",
		ThreadID:   threadID,
		OldTitle:   oldTitle,
		Confidence: 0,
		Reason:     reason,
		Signals:    signals,
		SourceHash: sourceHash,
	}
}

func oldTitle(thread *ThreadRecord) *string {
	if thread == nil {
		return nil
	}
	return thread.Name
}

func normalizeWhitespace(input string) string {
	return strings.TrimSpace(regexp.MustCompile(`\s+`).ReplaceAllString(input, " "))
}

func clip(input string, maxLength int) string {
	if len(input) <= maxLength {
		return input
	}
	output := input[:max(0, maxLength-1)]
	return strings.TrimRightFunc(output, unicode.IsSpace)
}

func words(input string) []string {
	normalized := strings.ToLower(normalizeWhitespace(input))
	cleaned := wordCleanRe.ReplaceAllString(normalized, " ")
	parts := strings.Fields(cleaned)
	output := make([]string, 0, len(parts))
	for _, word := range parts {
		if len(word) <= 2 {
			continue
		}
		if _, ok := stopwords[word]; ok {
			continue
		}
		output = append(output, word)
	}
	return output
}

func titleCase(input string) string {
	parts := strings.Fields(input)
	output := make([]string, 0, len(parts))
	upperID := regexp.MustCompile(`^[A-Z]{2,}-\d+$|^[A-Z0-9]{2,}$`)
	for _, word := range parts {
		if upperID.MatchString(word) || strings.Contains(word, "/") {
			output = append(output, word)
			continue
		}
		if word == "" {
			continue
		}
		output = append(output, strings.ToUpper(word[:1])+strings.ToLower(word[1:]))
	}
	return strings.Join(output, " ")
}

func jaccard(a, b []string) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 1
	}
	left := make(map[string]struct{}, len(a))
	right := make(map[string]struct{}, len(b))
	for _, value := range a {
		left[value] = struct{}{}
	}
	for _, value := range b {
		right[value] = struct{}{}
	}
	intersection := 0
	for value := range left {
		if _, ok := right[value]; ok {
			intersection++
		}
	}
	union := len(left)
	for value := range right {
		if _, ok := left[value]; !ok {
			union++
		}
	}
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

func hasControlCharacters(input string) bool {
	for _, char := range input {
		if char < 32 || char == 127 {
			return true
		}
	}
	return false
}

func intersects(a, b []string) bool {
	right := make(map[string]struct{}, len(b))
	for _, value := range b {
		right[value] = struct{}{}
	}
	for _, value := range a {
		if _, ok := right[value]; ok {
			return true
		}
	}
	return false
}

func dedupeWords(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	output := make([]string, 0, len(values))
	for _, value := range values {
		normalized := normalizeWhitespace(value)
		key := strings.ToLower(normalized)
		if normalized == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		output = append(output, normalized)
	}
	return output
}

func unique(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	output := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		output = append(output, value)
	}
	return output
}

func sha256Hex(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])
}

func formatScore(value float64) string {
	// Avoid fmt in this package's hot path; scores only need TS-compatible two decimals.
	scaled := int(value*100 + 0.5)
	return intString(scaled/100) + "." + twoDigits(scaled%100)
}

func twoDigits(value int) string {
	if value < 10 {
		return "0" + intString(value)
	}
	return intString(value)
}

func intString(value int) string {
	if value == 0 {
		return "0"
	}
	negative := value < 0
	if negative {
		value = -value
	}
	digits := make([]byte, 0, 12)
	for value > 0 {
		digits = append(digits, byte('0'+value%10))
		value /= 10
	}
	if negative {
		digits = append(digits, '-')
	}
	slices.Reverse(digits)
	return string(digits)
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
