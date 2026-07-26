import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Send, Star } from "lucide-react";
import { toast } from "sonner";
import { PageShell, Card, GoldButton } from "@/components/site/Primitives";
import { useAuth } from "@/hooks/useAuth";
import { submitFeedback } from "@/lib/api/feedbackClient";
import { seo, breadcrumbLd, webPageLd } from "@/lib/seo";

export const Route = createFileRoute("/feedback")({
  head: () =>
    seo({
      title: "Send Feedback — ChessOx",
      description:
        "Share feedback with the ChessOx team. Tell us what works, what does not and which chess features you would like to see next on the platform.",
      path: "/feedback",
      jsonLd: [
        webPageLd({
          name: "Send Feedback — ChessOx",
          description: "A form for sending product feedback and feature ideas to the ChessOx team.",
          path: "/feedback",
        }),
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Feedback", path: "/feedback" },
        ]),
      ],
    }),
  component: FeedbackPage,
});

function FeedbackPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback(user?.id ?? null, rating, message.trim());
      toast.success("Thank you for your feedback!");
      navigate({ to: "/home" });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell title="Submit Feedback">
      <Card className="max-w-2xl mx-auto mt-12 p-8 text-center border-gold/20">
        {/* h2 — PageShell renders this page's h1. */}
        <h2 className="font-display text-4xl mb-4 text-gradient-gold">Submit Feedback</h2>
        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          Your voice matters. Help us shape the future of ChessOx by sharing your ideas, feature
          requests, and feedback.
        </p>

        <form onSubmit={handleSubmit} className="text-left mb-8 space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <label className="block text-sm font-medium text-ivory/90 mb-3">
              Rate your experience
            </label>
            <div className="flex gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className="transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`h-8 w-8 ${star <= rating ? "fill-gold text-gold" : "text-white/20"}`}
                  />
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Select a star rating</p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <label htmlFor="message" className="block text-sm font-medium text-ivory/90 mb-3">
              How can we improve?
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what you love, what's broken, or what you'd like to see next..."
              className="w-full h-32 bg-[#0a0c10] border border-white/10 rounded-lg p-3 text-sm text-foreground focus:border-gold/50 focus:ring-1 focus:ring-gold/50 outline-none resize-none"
              required
            />
          </div>

          <div className="flex justify-between items-center gap-4 pt-2">
            <Link to="/home" className="text-sm text-muted-foreground hover:text-white transition">
              Cancel
            </Link>
            <GoldButton type="submit" disabled={submitting}>
              {submitting ? (
                "Submitting..."
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" /> Send Feedback
                </>
              )}
            </GoldButton>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
